using System.Linq.Expressions;
using CorporateOS.Application.Common.Interfaces;
using CorporateOS.Domain.Entities;

namespace CorporateOS.Application.Features.Projects;

/// <summary>
/// Single source of truth for who may see and change projects and tasks.
///
/// Projects — Admin: all. Manager: projects of their department, projects they manage or belong to.
///            Employee: projects they manage or belong to.
/// Tasks    — Admin: all. Manager: tasks in visible projects or assigned to their department.
///            Employee: tasks assigned to them, plus tasks in projects they manage.
/// </summary>
public static class ProjectAccess
{
    public static Expression<Func<Project, bool>> VisibleProjects(UserScope scope)
    {
        if (scope.IsAdmin)
        {
            return _ => true;
        }

        var employeeId = scope.EmployeeId ?? -1;
        var departmentId = scope.DepartmentId ?? -1;
        if (scope.IsManager)
        {
            return p => p.DepartmentId == departmentId || p.ProjectManagerId == employeeId ||
                        p.Members.Any(m => m.EmployeeId == employeeId);
        }

        return p => p.ProjectManagerId == employeeId || p.Members.Any(m => m.EmployeeId == employeeId);
    }

    public static Expression<Func<TaskItem, bool>> VisibleTasks(UserScope scope)
    {
        if (scope.IsAdmin)
        {
            return _ => true;
        }

        var employeeId = scope.EmployeeId ?? -1;
        var departmentId = scope.DepartmentId ?? -1;
        if (scope.IsManager)
        {
            return t => t.AssignedToId == employeeId ||
                        t.Project.ProjectManagerId == employeeId ||
                        t.Project.DepartmentId == departmentId ||
                        (t.AssignedTo != null && t.AssignedTo.DepartmentId == departmentId);
        }

        return t => t.AssignedToId == employeeId || t.Project.ProjectManagerId == employeeId;
    }

    /// <summary>Edit project details and membership.</summary>
    public static bool CanManageProject(UserScope scope, Project project) =>
        scope.IsAdmin || (scope.EmployeeId.HasValue && project.ProjectManagerId == scope.EmployeeId);

    /// <summary>Create, edit, reassign and delete tasks within the project.</summary>
    public static bool CanManageTasks(UserScope scope, Project project) =>
        CanManageProject(scope, project) || (scope.IsManager && project.DepartmentId == scope.DepartmentId);

    public static bool CanViewBudget(UserScope scope, Project project) =>
        scope.IsManagerOrAbove || (scope.EmployeeId.HasValue && project.ProjectManagerId == scope.EmployeeId);
}
