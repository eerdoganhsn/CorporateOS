$Base = "http://localhost:5000/api"

function Call($session, $method, $path, $token, $body = $null, [switch]$Raw) {
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $params = @{ Method = $method; Uri = "$Base$path"; Headers = $headers; ContentType = "application/json"; UseBasicParsing = $true; WebSession = $session }
    if ($null -ne $body) { $params["Body"] = ($body | ConvertTo-Json -Depth 5) }
    try { $r = Invoke-WebRequest @params; $status = [int]$r.StatusCode; $content = $r.Content }
    catch {
        $resp = $_.Exception.Response
        if (-not $resp) { return [pscustomobject]@{ Status = -1; Json = $null; Text = $_.Exception.Message } }
        $status = [int]$resp.StatusCode
        $content = (New-Object IO.StreamReader($resp.GetResponseStream())).ReadToEnd()
    }
    $json = $null; if ($content) { try { $json = $content | ConvertFrom-Json } catch {} }
    return [pscustomobject]@{ Status = $status; Json = $json; Text = $content }
}

function Check($label, $actual, $expected) {
    $mark = if ($actual -eq $expected) { "PASS" } else { "FAIL" }
    Write-Output ("{0}  {1,-62} expected {2}, got {3}" -f $mark, $label, $expected, $actual)
}

function Login($email) {
    $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $r = Call $s POST "/auth/login" $null @{ email = $email; password = "CorporateOS123!" }
    return @{ Session = $s; Token = $r.Json.data.accessToken; User = $r.Json.data.user }
}

# --- Auth ---
$bad = Call (New-Object Microsoft.PowerShell.Commands.WebRequestSession) POST "/auth/login" $null @{ email = "employee@corporateos.local"; password = "wrong-password" }
Check "Login with wrong password" $bad.Status 401
$invalid = Call (New-Object Microsoft.PowerShell.Commands.WebRequestSession) POST "/auth/login" $null @{ email = "not-an-email"; password = "" }
Check "Login validation (bad email, empty password)" $invalid.Status 400
Write-Output ("      validation errors: " + (($invalid.Json.errors | ConvertTo-Json -Compress)))
Check "No token -> /auth/me" (Call $null GET "/auth/me" $null).Status 401

$emp = Login "employee@corporateos.local"
$mgr = Login "manager@corporateos.local"
$adm = Login "admin@corporateos.local"
$sup = Login "superadmin@corporateos.local"
Check "Employee login returns token" ([bool]$emp.Token) $true
Check "Employee primary role" $emp.User.primaryRole "Employee"

$refresh = Call $emp.Session POST "/auth/refresh" $null
Check "Refresh via HttpOnly cookie" $refresh.Status 200
$oldCookieSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
foreach ($c in $emp.Session.Cookies.GetCookies("http://localhost:5000/api/auth")) { }
$emp.Token = $refresh.Json.data.accessToken

# Reuse detection: replay the very first cookie value after rotation
$s2 = Login "employee@corporateos.local"
$firstCookie = $s2.Session.Cookies.GetCookies("http://localhost:5000/api/auth")["corporateos_rt"].Value
$rot = Call $s2.Session POST "/auth/refresh" $null
Check "Second session refresh (rotation)" $rot.Status 200
$replay = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$replay.Cookies.Add((New-Object System.Net.Cookie("corporateos_rt", $firstCookie, "/api/auth", "localhost")))
Check "Replayed rotated refresh token is rejected" (Call $replay POST "/auth/refresh" $null).Status 401
Check "Reuse detection revoked the rotated session too" (Call $s2.Session POST "/auth/refresh" $null).Status 401

# --- Authorization ---
Check "Employee -> admin settings" (Call $null GET "/admin/settings" $emp.Token).Status 403
Check "Manager -> SuperAdmin-only setting change" (Call $null PUT "/admin/settings" $mgr.Token @{ values = @{ "Security.LockoutMinutes" = "20" } }).Status 403
Check "Admin -> advanced (security) setting change" (Call $null PUT "/admin/settings" $adm.Token @{ values = @{ "Security.LockoutMinutes" = "20" } }).Status 403
Check "Admin -> general setting change" (Call $null PUT "/admin/settings" $adm.Token @{ values = @{ "General.Phone" = "+1 555 0199" } }).Status 200
Check "Admin -> employee management" (Call $null GET "/employees" $adm.Token).Status 200

# --- Employees ---
$newEmp = @{ employeeNumber = "EMP-9001"; firstName = "Test"; lastName = "Person"; email = "test.person@corporateos.local"; departmentId = 1; positionId = 2; hireDate = "2026-01-05"; employmentType = "FullTime"; status = "Active"; createUserAccount = $true; role = "Employee"; temporaryPassword = "TempPass123!" }
$created = Call $null POST "/employees" $adm.Token $newEmp
Check "Admin creates employee with account" $created.Status 201
$dup = $newEmp.Clone(); $dup.email = "other@corporateos.local"; $dup.createUserAccount = $false
Check "Duplicate employee number" (Call $null POST "/employees" $adm.Token $dup).Status 409
$badEmail = $newEmp.Clone(); $badEmail.employeeNumber = "EMP-9002"; $badEmail.email = "nope"
Check "Invalid employee email" (Call $null POST "/employees" $adm.Token $badEmail).Status 400
$privileged = $newEmp.Clone(); $privileged.employeeNumber = "EMP-9003"; $privileged.email = "x3@corporateos.local"; $privileged.role = "Admin"
Check "Admin cannot grant Admin role (SuperAdmin only)" (Call $null POST "/employees" $adm.Token $privileged).Status 403
$salaryForMgr = (Call $null GET "/employees/$($emp.User.employeeId)" $mgr.Token).Json.data
Check "Manager cannot see salary" ($null -eq $salaryForMgr.salary) $true
$salaryForSelf = (Call $null GET "/employees/$($emp.User.employeeId)" $emp.Token).Json.data
Check "Employee sees own salary" ($null -ne $salaryForSelf.salary) $true

# --- Projects ---
$proj = @{ name = "Smoke Test Project"; projectCode = "SMK-1"; startDate = "2026-12-01"; endDate = "2026-11-01"; status = "Planning"; priority = "Low"; progressPercentage = 0 }
Check "Project invalid date range" (Call $null POST "/projects" $adm.Token $proj).Status 400
$proj.endDate = "2027-03-01"
$p = Call $null POST "/projects" $adm.Token $proj
Check "Create project" $p.Status 201
Check "Duplicate project code" (Call $null POST "/projects" $adm.Token $proj).Status 409

# --- Tasks ---
$othersTask = (Call $null GET "/tasks?pageSize=100" $adm.Token).Json.data.items | Where-Object { $_.assignedToId -ne $emp.User.employeeId } | Select-Object -First 1
Check "Employee cannot modify unauthorized task" (Call $null PATCH "/tasks/$($othersTask.id)/status" $emp.Token @{ status = "Completed" }).Status 403
$myTask = (Call $null GET "/tasks?mine=true&pageSize=50" $emp.Token).Json.data.items | Where-Object { $_.status -eq "Todo" } | Select-Object -First 1
Check "Employee updates own task progress" (Call $null PATCH "/tasks/$($myTask.id)/status" $emp.Token @{ status = "InProgress"; progressPercentage = 20 }).Status 200
Check "Task progress > 100 rejected" (Call $null PATCH "/tasks/$($myTask.id)/status" $emp.Token @{ status = "InProgress"; progressPercentage = 150 }).Status 400
$t = Call $null POST "/tasks" $mgr.Token @{ projectId = 1; title = "Manager-assigned task"; assignedToId = $emp.User.employeeId; status = "Todo"; priority = "Medium"; dueDate = "2026-12-20" }
Check "Manager assigns task to department employee" $t.Status 201
$finEmployee = ((Call $null GET "/lookups/employees" $adm.Token).Json.data | Where-Object { $_.departmentName -eq "Finance" } | Select-Object -First 1)
Check "Manager cannot assign outside dept/project" (Call $null POST "/tasks" $mgr.Token @{ projectId = 1; title = "Not allowed"; assignedToId = $finEmployee.id; status = "Todo"; priority = "Low" }).Status 403
Check "Comment on own task" (Call $null POST "/tasks/$($myTask.id)/comments" $emp.Token @{ content = "Started on this today." }).Status 201

# --- Leave ---
Check "Leave invalid date range" (Call $null POST "/leave-requests" $emp.Token @{ leaveType = "SickLeave"; startDate = "2026-12-10"; endDate = "2026-12-01" }).Status 400
$leave = Call $null POST "/leave-requests" $emp.Token @{ leaveType = "AnnualLeave"; startDate = "2027-01-11"; endDate = "2027-01-12"; reason = "Smoke test" }
Check "Submit leave" $leave.Status 201
Check "Employee cannot approve" (Call $null POST "/leave-requests/$($leave.Json.data.id)/approve" $emp.Token @{ note = "self" }).Status 403
Check "Manager approves leave" (Call $null POST "/leave-requests/$($leave.Json.data.id)/approve" $mgr.Token @{ note = "Approved" }).Status 200
Check "Approve again -> business rule 422" (Call $null POST "/leave-requests/$($leave.Json.data.id)/approve" $mgr.Token @{ note = "again" }).Status 422
$leave2 = Call $null POST "/leave-requests" $emp.Token @{ leaveType = "SickLeave"; startDate = "2027-02-01"; endDate = "2027-02-01" }
Check "Reject requires reason" (Call $null POST "/leave-requests/$($leave2.Json.data.id)/reject" $mgr.Token @{ reason = "" }).Status 400
Check "Manager rejects leave" (Call $null POST "/leave-requests/$($leave2.Json.data.id)/reject" $mgr.Token @{ reason = "Team offsite that day" }).Status 200
Check "Overlapping leave rejected" (Call $null POST "/leave-requests" $emp.Token @{ leaveType = "AnnualLeave"; startDate = "2027-01-12"; endDate = "2027-01-13" }).Status 409

# --- Expenses ---
Check "Expense amount <= 0 rejected" (Call $null POST "/expenses" $emp.Token @{ category = "Meal"; amount = 0; currency = "USD"; expenseDate = "2026-11-10"; description = "x" }).Status 400
$ex = Call $null POST "/expenses" $emp.Token @{ category = "Meal"; amount = 42.5; currency = "usd"; expenseDate = "2026-11-10"; description = "Client coffee" }
Check "Create expense draft" $ex.Status 201
Check "Submit expense" (Call $null POST "/expenses/$($ex.Json.data.id)/submit" $emp.Token).Status 200
Check "Manager approves expense" (Call $null POST "/expenses/$($ex.Json.data.id)/approve" $mgr.Token @{ note = "ok" }).Status 200
Check "Admin marks expense paid" (Call $null POST "/expenses/$($ex.Json.data.id)/mark-paid" $adm.Token).Status 200
$ex2 = Call $null POST "/expenses" $emp.Token @{ category = "Office"; amount = 15; currency = "USD"; expenseDate = "2026-11-12"; description = "Stationery" }
Call $null POST "/expenses/$($ex2.Json.data.id)/submit" $emp.Token | Out-Null
Check "Manager rejects expense" (Call $null POST "/expenses/$($ex2.Json.data.id)/reject" $mgr.Token @{ reason = "Use office supplies cabinet" }).Status 200

# --- Notifications / reports export ---
$unread = (Call $null GET "/notifications/unread-count" $emp.Token).Json.data.count
Check "Employee has unread notifications" ($unread -gt 0) $true
Check "Mark all notifications read" (Call $null PATCH "/notifications/read-all" $emp.Token).Status 200
$csv = Invoke-WebRequest -Uri "$Base/reports/expenses?format=Csv" -Headers @{ Authorization = "Bearer $($adm.Token)" } -UseBasicParsing
Check "CSV export content type" $csv.Headers["Content-Type"] "text/csv"
$xlsx = Invoke-WebRequest -Uri "$Base/reports/employees?format=Xlsx" -Headers @{ Authorization = "Bearer $($adm.Token)" } -UseBasicParsing
Check "Excel export is a zip (xlsx)" ([System.Text.Encoding]::ASCII.GetString($xlsx.Content[0..1])) "PK"

# --- Documents ---
$docs = (Call $null GET "/documents" $emp.Token).Json.data.items
Check "Employee cannot see AdminOnly documents" (@($docs | Where-Object { $_.accessLevel -eq "AdminOnly" }).Count) 0
$dl = Invoke-WebRequest -Uri "$Base/documents/$($docs[0].id)/download" -Headers @{ Authorization = "Bearer $($emp.Token)" } -UseBasicParsing
Check "Document download works" ([int]$dl.StatusCode) 200
$adminDoc = (Call $null GET "/documents?accessLevel=AdminOnly" $adm.Token).Json.data.items | Select-Object -First 1
Check "Employee download of AdminOnly doc forbidden" (Call $null GET "/documents/$($adminDoc.id)/download" $emp.Token).Status 403

# --- Audit ---
$audit = (Call $null GET "/admin/audit-logs?action=Leave.Approved" $sup.Token).Json.data
Check "Audit log recorded leave approval" ($audit.totalItems -gt 0) $true
$adminSees = (Call $null GET "/admin/audit-logs?entityName=User" $adm.Token).Json.data.totalItems
Check "Admin cannot see security audit entries" $adminSees 0

# --- Logout ---
Check "Logout" (Call $emp.Session POST "/auth/logout" $null).Status 200
Check "Refresh after logout rejected" (Call $emp.Session POST "/auth/refresh" $null).Status 401
