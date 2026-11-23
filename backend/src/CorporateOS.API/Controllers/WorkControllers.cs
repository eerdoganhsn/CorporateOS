using CorporateOS.API.Authorization;
using CorporateOS.Application.Common.Models;
using CorporateOS.Application.Features.Projects;
using CorporateOS.Application.Features.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CorporateOS.API.Controllers;

[Route("api/projects")]
public sealed class ProjectsController(IProjectService projects) : ApiControllerBase
{
    /// <summary>Projects visible to the caller. Budget is only returned to managers and administrators.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<ProjectListItemDto>>>> List([FromQuery] ProjectQuery query, CancellationToken ct) =>
        OkResponse(await projects.ListAsync(query, ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await projects.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> Create(SaveProjectRequest request, CancellationToken ct)
    {
        var created = await projects.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    /// <summary>Administrators and the project manager may edit. Only administrators can change budget, manager or department.</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> Update(int id, SaveProjectRequest request, CancellationToken ct) =>
        OkResponse(await projects.UpdateAsync(id, request, ct));

    [HttpPost("{id:int}/archive")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> Archive(int id, CancellationToken ct) =>
        OkResponse(await projects.SetArchivedAsync(id, true, ct));

    [HttpPost("{id:int}/unarchive")]
    [Authorize(Policy = Policies.AdminOrAbove)]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> Unarchive(int id, CancellationToken ct) =>
        OkResponse(await projects.SetArchivedAsync(id, false, ct));

    [HttpPost("{id:int}/members")]
    public async Task<ActionResult<ApiResponse<ProjectDetailDto>>> AddMember(int id, AddProjectMemberRequest request, CancellationToken ct) =>
        OkResponse(await projects.AddMemberAsync(id, request, ct));

    [HttpDelete("{id:int}/members/{employeeId:int}")]
    public async Task<IActionResult> RemoveMember(int id, int employeeId, CancellationToken ct)
    {
        await projects.RemoveMemberAsync(id, employeeId, ct);
        return NoContent();
    }

    [HttpGet("{id:int}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ActivityItemDto>>>> Activity(int id, CancellationToken ct) =>
        OkResponse(await projects.GetActivityAsync(id, ct));
}

[Route("api/tasks")]
public sealed class TasksController(ITaskService tasks) : ApiControllerBase
{
    /// <summary>Tasks visible to the caller with filtering, sorting and paging.</summary>
    [HttpGet]
    public async Task<ActionResult<ApiResponse<PagedResult<TaskListItemDto>>>> List([FromQuery] TaskQuery query, CancellationToken ct) =>
        OkResponse(await tasks.ListAsync(query, ct));

    /// <summary>Kanban columns (one per status) using the same filters as the list.</summary>
    [HttpGet("board")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TaskBoardColumnDto>>>> Board([FromQuery] TaskQuery query, CancellationToken ct) =>
        OkResponse(await tasks.GetBoardAsync(query, ct));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ApiResponse<TaskDetailDto>>> Get(int id, CancellationToken ct) =>
        OkResponse(await tasks.GetAsync(id, ct));

    [HttpPost]
    [Authorize(Policy = Policies.ManagerOrAbove)]
    public async Task<ActionResult<ApiResponse<TaskDetailDto>>> Create(CreateTaskRequest request, CancellationToken ct)
    {
        var created = await tasks.CreateAsync(request, ct);
        return CreatedResponse(nameof(Get), new { id = created.Id }, created);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ApiResponse<TaskDetailDto>>> Update(int id, UpdateTaskRequest request, CancellationToken ct) =>
        OkResponse(await tasks.UpdateAsync(id, request, ct));

    /// <summary>Status/progress update. Assignees may update their own tasks.</summary>
    [HttpPatch("{id:int}/status")]
    public async Task<ActionResult<ApiResponse<TaskDetailDto>>> UpdateStatus(int id, UpdateTaskStatusRequest request, CancellationToken ct) =>
        OkResponse(await tasks.UpdateStatusAsync(id, request, ct));

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id, CancellationToken ct)
    {
        await tasks.DeleteAsync(id, ct);
        return NoContent();
    }

    [HttpPost("{id:int}/comments")]
    public async Task<ActionResult<ApiResponse<TaskCommentDto>>> AddComment(int id, AddTaskCommentRequest request, CancellationToken ct) =>
        StatusCode(StatusCodes.Status201Created, ApiResponse.Ok(await tasks.AddCommentAsync(id, request, ct)));

    [HttpGet("{id:int}/activity")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ActivityItemDto>>>> Activity(int id, CancellationToken ct) =>
        OkResponse(await tasks.GetActivityAsync(id, ct));
}
