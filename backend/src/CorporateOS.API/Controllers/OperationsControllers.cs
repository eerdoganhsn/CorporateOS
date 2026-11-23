using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Expenses;
using CorporateOS.Application.Features.Leave;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CorporateOS.API.Controllers;

[Route("api/leave-requests")]
public sealed class LeaveRequestsController(ILeaveService leave) : ApiControllerBase
{
    /// <summary>Leave requests. scope=Mine (default), Approvals (pending, decidable) or All (everything visible).</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<LeaveRequestDto>>>> List([FromQuery] LeaveQuery query, CancellationToken ct) =>
        OkResponse(await leave.ListAsync(query, ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await leave.GetAsync(id, ct));

    /// <summary>Submits a leave request. Working days are calculated server-side; annual leave is checked against the balance.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Create(CreateLeaveRequest request, CancellationToken ct)
    {
        var created = await leave.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPost("{id:int}/approve")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Approve(int id, ApproveLeaveRequest request, CancellationToken ct) =>
        OkResponse(await leave.ApproveAsync(id, request, ct));

    [HttpPost("{id:int}/reject")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Reject(int id, RejectLeaveRequest request, CancellationToken ct) =>
        OkResponse(await leave.RejectAsync(id, request, ct));

    [HttpPost("{id:int}/cancel")]
    public async Task<ActionResult<ApiResponse<LeaveRequestDto>>> Cancel(int id, CancellationToken ct) =>
        OkResponse(await leave.CancelAsync(id, ct));

    /// <summary>Approved and pending leave overlapping the range (max 93 days).</summary>
    [HttpGet("calendar")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<LeaveCalendarEntryDto>>>> Calendar(
        [FromQuery] DateOnly from, [FromQuery] DateOnly to, [FromQuery] int? departmentId, CancellationToken ct) =>
        OkResponse(await leave.GetCalendarAsync(from, to, departmentId, ct));
}

[Route("api/leave-balances")]
public sealed class LeaveBalancesController(ILeaveService leave) : ApiControllerBase
{
    /// <summary>The caller's annual balance plus usage per leave type.</summary>
    [HttpGet("me")]
    public async Task<ActionResult<ApiResponse<MyLeaveSummaryDto>>> Mine([FromQuery] int? year, CancellationToken ct) =>
        OkResponse(await leave.GetMySummaryAsync(year, ct));

    [HttpGet]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<PagedResult<LeaveBalanceDto>>>> List([FromQuery] LeaveBalanceQuery query, CancellationToken ct) =>
        OkResponse(await leave.ListBalancesAsync(query, ct));

    [HttpPut("{employeeId:int}/{year:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<LeaveBalanceDto>>> Update(int employeeId, int year, UpdateLeaveBalanceRequest request, CancellationToken ct) =>
        OkResponse(await leave.UpdateBalanceAsync(employeeId, year, request, ct));
}

[Route("api/expenses")]
public sealed class ExpensesController(IExpenseService expenses) : ApiControllerBase
{
    /// <summary>Expenses. scope=Mine (default), Approvals (submitted, decidable) or All (everything visible).</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ExpenseDto>>>> List([FromQuery] ExpenseQuery query, CancellationToken ct) =>
        OkResponse(await expenses.ListAsync(query, ct));

    [HttpGet("me/totals")]
    public async Task<ActionResult<ApiResponse<ExpenseTotalsDto>>> MyTotals(CancellationToken ct) =>
        OkResponse(await expenses.GetMyTotalsAsync(ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await expenses.GetAsync(id, ct));

    /// <summary>Creates a draft expense for the caller.</summary>
    [HttpPost]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Create(SaveExpenseRequest request, CancellationToken ct)
    {
        var created = await expenses.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Update(int id, SaveExpenseRequest request, CancellationToken ct) =>
        OkResponse(await expenses.UpdateAsync(id, request, ct));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await expenses.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Uploads a receipt (PDF, PNG or JPG; size limit from system settings).</summary>
    [HttpPost("{id:int}/receipt")]
    [RequestSizeLimit(55 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> UploadReceipt(int id, IFormFile file, CancellationToken ct) =>
        OkResponse(await expenses.UploadReceiptAsync(id, ToUpload(file), ct));

    [HttpGet("{id:int}/receipt")]
    [Produces("application/octet-stream")]
    public async Task<IActionResult> DownloadReceipt(int id, CancellationToken ct)
    {
        var file = await expenses.DownloadReceiptAsync(id, ct);
        return FileResult(file.Content, file.ContentType, file.FileName);
    }

    [HttpPost("{id:int}/submit")]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Submit(int id, CancellationToken ct) =>
        OkResponse(await expenses.SubmitAsync(id, ct));

    [HttpPost("{id:int}/approve")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Approve(int id, ApproveExpenseRequest request, CancellationToken ct) =>
        OkResponse(await expenses.ApproveAsync(id, request, ct));

    [HttpPost("{id:int}/reject")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> Reject(int id, RejectExpenseRequest request, CancellationToken ct) =>
        OkResponse(await expenses.RejectAsync(id, request, ct));

    [HttpPost("{id:int}/mark-paid")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<ExpenseDto>>> MarkPaid(int id, CancellationToken ct) =>
        OkResponse(await expenses.MarkPaidAsync(id, ct));
}
