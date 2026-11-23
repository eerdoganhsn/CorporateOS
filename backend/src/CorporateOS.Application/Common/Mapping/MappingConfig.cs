using CorporateOS.Application.Features.Positions;
using CorporateOS.Domain.Entities;
using CorporateOS.Domain.Enums;
using Mapster;

namespace CorporateOS.Application.Common.Mapping;

/// <summary>
/// Mapster configuration for straightforward entity-to-DTO projections. Complex,
/// authorization-dependent shapes are projected explicitly in the services instead.
/// </summary>
public static class MappingConfig
{
    public static void Register(TypeAdapterConfig config)
    {
        config.NewConfig<Position, PositionDto>()
            .Map(d => d.DepartmentName, s => s.Department != null ? s.Department.Name : null)
            .Map(d => d.EmployeeCount, s => s.Employees.Count(e => e.Status != EmployeeStatus.Terminated));
    }
}
