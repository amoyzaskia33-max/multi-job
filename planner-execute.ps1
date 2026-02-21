param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [switch]$UseAi,
  [switch]$ForceRuleBased,
  [int]$WaitSeconds = 2
)

$ErrorActionPreference = "Stop"

function Invoke-JsonPost {
  param(
    [string]$Uri,
    [object]$BodyObject
  )

  $bodyJson = $BodyObject | ConvertTo-Json -Depth 12 -Compress
  return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $bodyJson
}

$plannerPath = if ($UseAi) { "/planner/plan-ai" } else { "/planner/plan" }
$planPayload = @{
  prompt = $Prompt
}

if ($UseAi -and $ForceRuleBased) {
  $planPayload.force_rule_based = $true
}

$plan = Invoke-JsonPost -Uri "$BaseUrl$plannerPath" -BodyObject $planPayload

if (-not $plan.jobs -or $plan.jobs.Count -eq 0) {
  throw "Planner tidak menghasilkan job. Cek prompt atau warning planner."
}

$jobResults = @()

foreach ($planned in $plan.jobs) {
  $jobSpec = $planned.job_spec
  $jobId = [string]$jobSpec.job_id
  $createStatus = "created"

  try {
    Invoke-JsonPost -Uri "$BaseUrl/jobs" -BodyObject $jobSpec | Out-Null
  } catch {
    $createStatus = "exists-or-error"
  }

  $runResp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/jobs/$jobId/run"
  Start-Sleep -Seconds $WaitSeconds
  $runDetail = Invoke-RestMethod -Method Get -Uri "$BaseUrl/runs/$($runResp.run_id)"

  $jobResults += [pscustomobject]@{
    job_id         = $jobId
    type           = $jobSpec.type
    create_status  = $createStatus
    run_id         = $runResp.run_id
    run_status     = $runDetail.status
    result_success = $runDetail.result.success
    result_error   = $runDetail.result.error
  }
}

[pscustomobject]@{
  planner_source = $plan.planner_source
  summary        = $plan.summary
  warnings       = $plan.warnings
  jobs           = $jobResults
} | ConvertTo-Json -Depth 10
