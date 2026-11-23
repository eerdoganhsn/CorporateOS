param([string]$Base = "http://localhost:5000/api")

function Invoke-Api($method, $path, $token, $body = $null) {
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        $params = @{ Method = $method; Uri = "$Base$path"; Headers = $headers; ContentType = "application/json"; UseBasicParsing = $true }
        if ($body) { $params["Body"] = ($body | ConvertTo-Json -Depth 5) }
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $r.Content }
    } catch {
        $resp = $_.Exception.Response
        $content = ""
        if ($resp) {
            $sr = New-Object IO.StreamReader($resp.GetResponseStream()); $content = $sr.ReadToEnd()
            return [pscustomobject]@{ Status = [int]$resp.StatusCode; Body = $content }
        }
        return [pscustomobject]@{ Status = -1; Body = $_.Exception.Message }
    }
}

function Login($email) {
    $r = Invoke-Api POST "/auth/login" $null @{ email = $email; password = "CorporateOS123!" }
    if ($r.Status -ne 200) { Write-Output "LOGIN FAIL $email $($r.Status) $($r.Body)"; return $null }
    return ($r.Body | ConvertFrom-Json).data.accessToken
}

$users = @{
    SuperAdmin = "superadmin@corporateos.local"
    Admin = "admin@corporateos.local"
    Manager = "manager@corporateos.local"
    Employee = "employee@corporateos.local"
}

$endpoints = @(
    "/auth/me", "/profile", "/dashboard/employee", "/dashboard/manager", "/dashboard/admin",
    "/employees?pageSize=5", "/employees/4", "/employees/4/activity", "/employees/4/projects",
    "/departments", "/departments/1", "/positions",
    "/lookups/departments", "/lookups/positions", "/lookups/employees", "/lookups/projects",
    "/projects", "/projects/1", "/projects/1/activity",
    "/tasks?pageSize=5", "/tasks/board", "/tasks/2", "/tasks/2/activity", "/tasks?overdueOnly=true&sortBy=priority&sortDirection=desc",
    "/leave-requests", "/leave-requests?scope=Approvals", "/leave-requests?scope=All", "/leave-balances/me", "/leave-balances",
    "/leave-requests/calendar?from=2026-11-01&to=2026-11-30",
    "/expenses", "/expenses?scope=Approvals", "/expenses?scope=All", "/expenses/me/totals",
    "/announcements", "/announcements?includeInactive=true", "/documents",
    "/notifications", "/notifications/unread-count", "/search?q=por",
    "/reports/employees", "/reports/departments", "/reports/projects", "/reports/tasks", "/reports/leave", "/reports/expenses?groupBy=category",
    "/admin/users", "/admin/roles", "/admin/audit-logs", "/admin/audit-logs/filters", "/admin/settings", "/settings/public"
)

foreach ($role in "SuperAdmin", "Admin", "Manager", "Employee") {
    $token = Login $users[$role]
    if (-not $token) { continue }
    $line = "$role".PadRight(11)
    $problems = @()
    foreach ($ep in $endpoints) {
        $r = Invoke-Api GET $ep $token
        if ($r.Status -ge 500 -or $r.Status -eq -1) { $problems += "  500 $ep :: $($r.Body.Substring(0, [Math]::Min(300, $r.Body.Length)))" }
        elseif ($r.Status -ne 200) { $problems += "  $($r.Status) $ep" }
    }
    Write-Output "$line ok=$($endpoints.Count - $problems.Count)/$($endpoints.Count)"
    $problems | ForEach-Object { Write-Output $_ }
}
