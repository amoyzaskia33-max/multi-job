from app.services.api.planner_ai import PlannerAiRequest, build_plan_from_ai_payload, build_plan_with_ai


def test_build_plan_from_ai_payload_converts_jobs():
    request = PlannerAiRequest(
        prompt="monitor dan laporan",
        timezone="Asia/Jakarta",
        default_channel="telegram",
        default_account_id="bot_a01",
    )

    payload = {
        "summary": "Rencana dari AI",
        "jobs": [
            {
                "job_id": "monitor-utama",
                "type": "monitor.channel",
                "reason": "Pantau koneksi utama",
                "schedule": {"interval_sec": 60},
                "inputs": {"channel": "whatsapp", "account_id": "ops_01"},
            },
            {
                "type": "report.daily",
                "reason": "Laporan harian",
                "schedule": {"cron": "0 7 * * *"},
                "inputs": {"timezone": "Asia/Jakarta"},
            },
        ],
    }

    plan = build_plan_from_ai_payload(request, payload)

    assert plan.planner_source == "smolagents"
    assert len(plan.jobs) == 2
    assert plan.jobs[0].job_spec.type == "monitor.channel"
    assert plan.jobs[0].job_spec.inputs["channel"] == "whatsapp"
    assert plan.jobs[1].job_spec.type == "report.daily"
    assert plan.jobs[1].job_spec.schedule is not None
    assert plan.jobs[1].job_spec.schedule.cron == "0 7 * * *"


def test_build_plan_with_ai_force_rule_based_always_uses_fallback():
    request = PlannerAiRequest(
        prompt="Pantau telegram akun bot_a01 tiap 30 detik",
        force_rule_based=True,
    )

    plan = build_plan_with_ai(request)
    assert plan.planner_source == "rule_based"
    assert len(plan.jobs) == 1
    assert any("force_rule_based" in warning for warning in plan.warnings)


def test_build_plan_from_ai_payload_supports_agent_workflow_type():
    request = PlannerAiRequest(
        prompt="Sinkron github ke notion",
        timezone="Asia/Jakarta",
        default_channel="telegram",
        default_account_id="bot_a01",
    )

    payload = {
        "summary": "Workflow lintas integrasi",
        "jobs": [
            {
                "job_id": "workflow-utama",
                "type": "agent.workflow",
                "reason": "Perlu rangkaian aksi provider",
                "schedule": None,
                "inputs": {"prompt": "Sinkron github ke notion"},
            }
        ],
    }

    plan = build_plan_from_ai_payload(request, payload)

    assert len(plan.jobs) == 1
    job = plan.jobs[0].job_spec
    assert job.type == "agent.workflow"
    assert job.schedule is None
    assert job.inputs["prompt"] == "Sinkron github ke notion"
