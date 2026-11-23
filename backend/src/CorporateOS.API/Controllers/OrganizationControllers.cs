using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Departments;
using CorporateOS.Application.Features.Employees;
using CorporateOS.Application.Features.Lookups;
using CorporateOS.Application.Features.Positions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CorporateOS.API.Controllers;

[Route("api/departments")]
public sealed class DepartmentsController(IDepartmentService departments) : ApiControllerBase
{
    /// <summary>Lists departments (managers see only their own).</summary>
    [HttpGet]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<PagedResult<DepartmentListItemDto>>>> List([FromQuery] DepartmentQuery query, CancellationToken ct) =>
        OkResponse(await departments.ListAsync(query, ct));

    /// <summary>Department detail with employees, active projects and task/leave/expense summaries.</summary>
    [HttpGet("{id:int}")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<DepartmentDetailDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await departments.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<DepartmentDetailDto>>> Create(SaveDepartmentRequest request, CancellationToken ct)
    {
        var created = await departments.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<DepartmentDetailDto>>> Update(int id, SaveDepartmentRequest request, CancellationToken ct) =>
        OkResponse(await departments.UpdateAsync(id, request, ct));

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await departments.DeleteAsync(id, ct);
        return NoContent();
    }
}

[Route("api/positions")]
public sealed class PositionsController(IPositionService positions) : ApiControllerBase
{
    [HttpGet]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<PagedResult<PositionDto>>>> List([FromQuery] PositionQuery query, CancellationToken ct) =>
        OkResponse(await positions.ListAsync(query, ct));

    [HttpPost]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<PositionDto>>> Create(SavePositionRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse.Ok(await positions.CreateAsync(request, ct)));

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<PositionDto>>> Update(int id, SavePositionRequest request, CancellationToken ct) =>
        OkResponse(await positions.UpdateAsync(id, request, ct));

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await positions.DeleteAsync(id, ct);
        return NoContent();
    }
}

[Route("api/employees")]
public sealed class EmployeesController(IEmployeeService employees) : ApiControllerBase
{
    /// <summary>Paged employee directory with search, filters and sorting. Managers see their department.</summary>
    [HttpGet]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<PagedResult<EmployeeListItemDto>>>> List([FromQuery] EmployeeQuery query, CancellationToken ct) =>
        OkResponse(await employees.ListAsync(query, ct));

    /// <summary>Employee profile. Salary is only returned to administrators and the employee themself.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<EmployeeDetailDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await employees.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<EmployeeDetailDto>>> Create(CreateEmployeeRequest request, CancellationToken ct)
    {
        var created = await employees.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<EmployeeDetailDto>>> Update(int id, UpdateEmployeeRequest request, CancellationToken ct) =>
        OkResponse(await employees.UpdateAsync(id, request, ct));

    /// <summary>Activates, deactivates or terminates an employee (also syncs the linked user account).</summary>
    [HttpPatch("{id:int}/status")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<EmployeeDetailDto>>> ChangeStatus(int id, ChangeEmployeeStatusRequest request, CancellationToken ct) =>
        OkResponse(await employees.ChangeStatusAsync(id, request.Status, ct));

    [HttpDelete("{id:int}")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await employees.DeleteAsync(id, ct);
        return NoContent();
    }

    /// <summary>Uploads a profile image (PNG, JPG or WEBP, max 2 MB).</summary>
    [HttpPost("{id:int}/image")]
    [RequestSizeLimit(3 * 1024 * 1024)]
    public async Task<ActionResult<ApiResponse<string>>> UploadImage(int id, IFormFile file, CancellationToken ct) =>
        OkResponse(await employees.UploadImageAsync(id, ToUpload(file), ct));

    [HttpGet("{id:int}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ActivityItemDto>>>> Activity(int id, CancellationToken ct) =>
        OkResponse(await employees.GetActivityAsync(id, ct));

    [HttpGet("{id:int}/projects")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EmployeeProjectDto>>>> Projects(int id, CancellationToken ct) =>
        OkResponse(await employees.GetProjectsAsync(id, ct));
}

[Route("api/lookups")]
public sealed class LookupsController(ILookupService lookups) : ApiControllerBase
{
    [HttpGet("departments")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<DepartmentLookupDto>>>> Departments(CancellationToken ct) =>
        OkResponse(await lookups.DepartmentsAsync(ct));

    [HttpGet("positions")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PositionLookupDto>>>> Positions([FromQuery] int? departmentId, CancellationToken ct) =>
        OkResponse(await lookups.PositionsAsync(departmentId, ct));

    [HttpGet("employees")]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EmployeeLookupDto>>>> Employees([FromQuery] int? departmentId, [FromQuery] int? projectId, CancellationToken ct) =>
        OkResponse(await lookups.EmployeesAsync(departmentId, projectId, ct));

    [HttpGet("projects")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ProjectLookupDto>>>> Projects(CancellationToken ct) =>
        OkResponse(await lookups.ProjectsAsync(ct));
}
