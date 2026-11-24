using CorporateOS.Application.Common.Exceptions;
using CorporateOS.Application.Common.Extensions;
using CorporateOS.Application.Common.Files;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Leave;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using CorporateOS.Domain.Exceptions;
using CorporateOS.Domain.Localization;
using Microsoft.EntityFrameworkCore;

namespace CorporateOS.Application.Features.Expenses;

public interface IExpenseService
{
    Task<PagedResult<ExpenseDto>> ListAsync(ExpenseQuery query, CancellationToken cancellationToken);
    Task<ExpenseTotalsDto> GetMyTotalsAsync(CancellationToken cancellationToken);
    Task<ExpenseDto> GetAsync(int id, CancellationToken cancellationToken);
    Task<ExpenseDto> CreateAsync(SaveExpenseRequest request, CancellationToken cancellationToken);
    Task<ExpenseDto> UpdateAsync(int id, SaveExpenseRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(int id, CancellationToken cancellationToken);
    Task<ExpenseDto> UploadReceiptAsync(int id, FileUpload file, CancellationToken cancellationToken);
    Task<FileDownload> DownloadReceiptAsync(int id, CancellationToken cancellationToken);
    Task<ExpenseDto> SubmitAsync(int id, CancellationToken cancellationToken);
    Task<ExpenseDto> ApproveAsync(int id, ApproveExpenseRequest request, CancellationToken cancellationToken);
    Task<ExpenseDto> RejectAsync(int id, RejectExpenseRequest request, CancellationToken cancellationToken);
    Task<ExpenseDto> MarkPaidAsync(int id, CancellationToken cancellationToken);
}

public sealed class ExpenseService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IAuditService audit,
    INotificationPublisher notifications,
    IFileUploadValidator fileValidator,
    IFileStorage storage,
    TimeProvider clock) : IExpenseService
{
    private const string EntityName = nameof(Expense);

    private static readonly IReadOnlyDictionary<string, System.Linq.Expressions.Expression<Func<Expense, object?>>> Sort =
        SortMap.For<Expense>(
            ("expenseDate", e => e.ExpenseDate),
            ("amount", e => e.Amount),
            ("category", e => e.Category),
            ("status", e => e.Status),
            ("employee", e => e.Employee.LastName),
            ("submittedAt", e => e.SubmittedAt),
            ("createdAt", e => e.CreatedAt));

    public async Task<PagedResult<ExpenseDto>> ListAsync(ExpenseQuery query, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var expenses = Visible(scope);

        expenses = query.Scope switch
        {
            RequestListScope.Mine => expenses.Where(e => e.EmployeeId == (scope.EmployeeId ?? -1)),
            RequestListScope.Approvals => scope.IsManagerOrAbove
                ? expenses.Where(e => e.Status == ExpenseStatus.Submitted && e.EmployeeId != scope.EmployeeId)
                : expenses.Where(_ => false),
            // Drafts are private to their author.
            _ => expenses.Where(e => e.Status != ExpenseStatus.Draft || e.EmployeeId == scope.EmployeeId)
        };

        var search = query.Search?.Trim();
        expenses = expenses
            .WhereIf(query.EmployeeId.HasValue, e => e.EmployeeId == query.EmployeeId)
            .WhereIf(query.DepartmentId.HasValue, e => e.Employee.DepartmentId == query.DepartmentId)
            .WhereIf(query.Status.HasValue, e => e.Status == query.Status)
            .WhereIf(query.Category.HasValue, e => e.Category == query.Category)
            .WhereIf(query.From.HasValue, e => e.ExpenseDate >= query.From)
            .WhereIf(query.To.HasValue, e => e.ExpenseDate <= query.To)
            .WhereIf(!string.IsNullOrEmpty(search), e =>
                e.Description.Contains(search!) || (e.Employee.FirstName + " " + e.Employee.LastName).Contains(search!));

        var page = await Project(expenses.ApplySort(query, Sort, query.Scope == RequestListScope.Approvals ? "submittedAt" : "expenseDate",
                query.Scope != RequestListScope.Approvals))
            .ToPagedResultAsync(query, cancellationToken);

        return new PagedResult<ExpenseDto>
        {
            Items = page.Items.Select(e => Decorate(e, scope)).ToList(),
            Page = page.Page,
            PageSize = page.PageSize,
            TotalItems = page.TotalItems
        };
    }

    public async Task<ExpenseTotalsDto> GetMyTotalsAsync(CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var employeeId = scope.RequireEmployeeId();
        var yearStart = new DateOnly(Now.Year, 1, 1);
        var totals = await db.Expenses.AsNoTracking()
            .Where(e => e.EmployeeId == employeeId && e.ExpenseDate >= yearStart)
            .GroupBy(e => e.Status)
            .Select(g => new { Status = g.Key, Count = g.Count(), Amount = g.Sum(e => e.Amount) })
            .ToListAsync(cancellationToken);
        decimal Sum(ExpenseStatus s) => totals.FirstOrDefault(t => t.Status == s)?.Amount ?? 0;

        return new ExpenseTotalsDto(totals.Sum(t => t.Count), Sum(ExpenseStatus.Draft), Sum(ExpenseStatus.Submitted),
            Sum(ExpenseStatus.Approved), Sum(ExpenseStatus.Paid));
    }

    public async Task<ExpenseDto> GetAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var dto = await Project(Visible(scope).Where(e => e.Id == id && (e.Status != ExpenseStatus.Draft || e.EmployeeId == scope.EmployeeId)))
            .FirstOrDefaultAsync(cancellationToken);
        if (dto is null)
        {
            throw await db.Expenses.AnyAsync(e => e.Id == id, cancellationToken)
                ? new ForbiddenException(Text.Get("expense.noAccess"))
                : new NotFoundException("Expense", id);
        }

        return Decorate(dto, scope);
    }

    public async Task<ExpenseDto> CreateAsync(SaveExpenseRequest request, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var expense = new Expense { EmployeeId = scope.RequireEmployeeId(), Status = ExpenseStatus.Draft };
        Apply(expense, request);
        db.Expenses.Add(expense);
        await db.SaveChangesAsync(cancellationToken);

        audit.Record("Expense.Created", EntityName, expense.Id.ToString(), newValues: Snapshot(expense));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(expense.Id, cancellationToken);
    }

    public async Task<ExpenseDto> UpdateAsync(int id, SaveExpenseRequest request, CancellationToken cancellationToken)
    {
        var expense = await LoadOwnEditableAsync(id, cancellationToken);
        var before = Snapshot(expense);
        Apply(expense, request);
        audit.Record("Expense.Updated", EntityName, id.ToString(), before, Snapshot(expense));
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var expense = await LoadOwnEditableAsync(id, cancellationToken);
        if (expense.Status != ExpenseStatus.Draft)
        {
            throw new DomainException(Text.Get("expense.onlyDraftDelete"));
        }

        db.Expenses.Remove(expense);
        audit.Record("Expense.Deleted", EntityName, id.ToString(), Snapshot(expense));
        await db.SaveChangesAsync(cancellationToken);

        if (expense.ReceiptPath is not null)
        {
            await storage.DeleteAsync(expense.ReceiptPath, cancellationToken);
        }
    }

    public async Task<ExpenseDto> UploadReceiptAsync(int id, FileUpload file, CancellationToken cancellationToken)
    {
        var expense = await LoadOwnEditableAsync(id, cancellationToken);
        var validated = await fileValidator.ValidateAsync(file, UploadKind.Receipt, cancellationToken);

        await using var stream = file.OpenReadStream();
        var path = await storage.SaveAsync(stream, "receipts", validated.Extension, cancellationToken);
        var previous = expense.ReceiptPath;

        expense.ReceiptPath = path;
        expense.ReceiptFileName = validated.SafeOriginalName;
        expense.ReceiptContentType = validated.ContentType;
        audit.Record("Expense.ReceiptUploaded", EntityName, id.ToString(), newValues: new { FileName = validated.SafeOriginalName, file.Length });
        await db.SaveChangesAsync(cancellationToken);

        if (previous is not null)
        {
            await storage.DeleteAsync(previous, cancellationToken);
        }

        return await GetAsync(id, cancellationToken);
    }

    public async Task<FileDownload> DownloadReceiptAsync(int id, CancellationToken cancellationToken)
    {
        var dto = await GetAsync(id, cancellationToken); // enforces visibility
        var expense = await db.Expenses.AsNoTracking().FirstAsync(e => e.Id == id, cancellationToken);
        if (!dto.HasReceipt || expense.ReceiptPath is null)
        {
            throw new NotFoundException(Text.Get("expense.noReceipt"));
        }

        var stream = await storage.OpenReadAsync(expense.ReceiptPath, cancellationToken)
                     ?? throw new NotFoundException(Text.Get("error.fileMissing"));
        return new FileDownload(stream, expense.ReceiptContentType ?? "application/octet-stream", expense.ReceiptFileName ?? $"receipt-{id}");
    }

    public async Task<ExpenseDto> SubmitAsync(int id, CancellationToken cancellationToken)
    {
        var expense = await LoadOwnEditableAsync(id, cancellationToken);
        var employee = await db.Employees.Include(e => e.Department).FirstAsync(e => e.Id == expense.EmployeeId, cancellationToken);

        expense.Submit(Now);

        var approvers = new[] { employee.ManagerId, employee.Department.ManagerId }
            .Where(a => a.HasValue && a != employee.Id).Select(a => a!.Value);
        await notifications.NotifyEmployeesAsync(approvers, LocalizedText.Of("notify.expenseSubmitted.title"),
            LocalizedText.Of("notify.expenseSubmitted.message", employee.FullName, expense.Amount, expense.Currency, expense.Category, expense.Description),
            NotificationType.ExpenseSubmitted, EntityName, id.ToString(), cancellationToken);
        audit.Record("Expense.Submitted", EntityName, id.ToString(), newValues: new { expense.Amount, expense.Currency, expense.Status });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ExpenseDto> ApproveAsync(int id, ApproveExpenseRequest request, CancellationToken cancellationToken)
    {
        var (scope, expense) = await LoadForDecisionAsync(id, cancellationToken);
        expense.Approve(scope.RequireEmployeeId(), request.Note?.Trim(), Now);

        await notifications.NotifyEmployeesAsync([expense.EmployeeId], LocalizedText.Of("notify.expenseApproved.title"),
            LocalizedText.Of("notify.expenseApproved.message", expense.Category, expense.Amount, expense.Currency), NotificationType.ExpenseApproved,
            EntityName, id.ToString(), cancellationToken);
        audit.Record("Expense.Approved", EntityName, id.ToString(), new { Status = ExpenseStatus.Submitted },
            new { expense.Status, expense.Amount, expense.ApprovalNote });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ExpenseDto> RejectAsync(int id, RejectExpenseRequest request, CancellationToken cancellationToken)
    {
        var (scope, expense) = await LoadForDecisionAsync(id, cancellationToken);
        expense.Reject(scope.RequireEmployeeId(), request.Reason.Trim(), Now);

        await notifications.NotifyEmployeesAsync([expense.EmployeeId], LocalizedText.Of("notify.expenseRejected.title"),
            LocalizedText.Of("notify.expenseRejected.message", expense.Category, expense.Amount, expense.Currency, expense.RejectionReason),
            NotificationType.ExpenseRejected, EntityName, id.ToString(), cancellationToken);
        audit.Record("Expense.Rejected", EntityName, id.ToString(), new { Status = ExpenseStatus.Submitted },
            new { expense.Status, expense.RejectionReason });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<ExpenseDto> MarkPaidAsync(int id, CancellationToken cancellationToken)
    {
        var expense = await db.Expenses.FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Expense", id);
        expense.MarkPaid(Now);

        await notifications.NotifyEmployeesAsync([expense.EmployeeId], LocalizedText.Of("notify.expensePaid.title"),
            LocalizedText.Of("notify.expensePaid.message", expense.Category, expense.Amount, expense.Currency), NotificationType.ExpensePaid,
            EntityName, id.ToString(), cancellationToken);
        audit.Record("Expense.Paid", EntityName, id.ToString(), new { Status = ExpenseStatus.Approved }, new { expense.Status });
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    private IQueryable<Expense> Visible(UserScope scope)
    {
        var expenses = db.Expenses.AsNoTracking();
        if (scope.IsAdmin)
        {
            return expenses;
        }

        var employeeId = scope.EmployeeId ?? -1;
        var departmentId = scope.DepartmentId ?? -1;
        return scope.IsManager
            ? expenses.Where(e => e.EmployeeId == employeeId || e.Employee.DepartmentId == departmentId)
            : expenses.Where(e => e.EmployeeId == employeeId);
    }

    private async Task<Expense> LoadOwnEditableAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var expense = await db.Expenses.FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Expense", id);

        if (expense.EmployeeId != scope.EmployeeId)
        {
            throw new ForbiddenException(Text.Get("expense.ownOnly"));
        }

        if (!expense.IsEditable)
        {
            throw new DomainException(Text.Get("expense.locked", expense.Status));
        }

        return expense;
    }

    private async Task<(UserScope Scope, Expense Expense)> LoadForDecisionAsync(int id, CancellationToken cancellationToken)
    {
        var scope = await currentUser.GetScopeAsync(cancellationToken);
        var expense = await db.Expenses.Include(e => e.Employee).FirstOrDefaultAsync(e => e.Id == id, cancellationToken)
                      ?? throw new NotFoundException("Expense", id);

        if (!scope.IsAdmin && !scope.ManagesDepartment(expense.Employee.DepartmentId))
        {
            throw new ForbiddenException(Text.Get("expense.ownDepartmentOnly"));
        }

        return (scope, expense);
    }

    private static void Apply(Expense expense, SaveExpenseRequest request)
    {
        expense.Category = request.Category;
        expense.Amount = decimal.Round(request.Amount, 2);
        expense.Currency = request.Currency.Trim().ToUpperInvariant();
        expense.ExpenseDate = request.ExpenseDate;
        expense.Description = request.Description.Trim();
    }

    private static IQueryable<ExpenseDto> Project(IQueryable<Expense> query) =>
        query.Select(e => new ExpenseDto(
            e.Id, e.EmployeeId, e.Employee.FirstName + " " + e.Employee.LastName, e.Employee.EmployeeNumber,
            e.Employee.Department.Name, e.Category, e.Amount, e.Currency, e.ExpenseDate, e.Description,
            e.ReceiptPath != null, e.ReceiptFileName, e.Status, e.SubmittedAt,
            e.ApprovedBy != null ? e.ApprovedBy.FirstName + " " + e.ApprovedBy.LastName : null,
            e.ApprovedAt, e.ApprovalNote, e.RejectionReason, e.PaidAt, e.CreatedAt,
            CanEdit: false, CanApprove: false, CanMarkPaid: false)); // permission flags are computed in Decorate

    private static ExpenseDto Decorate(ExpenseDto dto, UserScope scope)
    {
        var isOwner = dto.EmployeeId == scope.EmployeeId;
        return dto with
        {
            CanEdit = isOwner && dto.Status is ExpenseStatus.Draft or ExpenseStatus.Rejected,
            // Visible() limits managers to their department, so visibility + role implies authority.
            CanApprove = !isOwner && dto.Status == ExpenseStatus.Submitted && scope.IsManagerOrAbove,
            CanMarkPaid = scope.IsAdmin && dto.Status == ExpenseStatus.Approved
        };
    }

    private static object Snapshot(Expense e) => new { e.Category, e.Amount, e.Currency, e.ExpenseDate, e.Description, e.Status };


    private DateTime Now => clock.GetUtcNow().UtcDateTime;
}
