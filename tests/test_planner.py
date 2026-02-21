from app.services.api.planner import PlannerRequest, build_plan_from_prompt


def test_plan_monitor_prompt_generates_monitor_job():
    plan = build_plan_from_prompt(
        PlannerRequest(
            prompt="Pantau telegram akun bot_a01 tiap 45 detik",
        )
    )

    assert len(plan.jobs) == 1
    job = plan.jobs[0].job_spec
    assert job.type == "monitor.channel"
    assert job.inputs["channel"] == "telegram"
    assert job.inputs["account_id"] == "bot_a01"
    assert job.schedule is not None
    assert job.schedule.interval_sec == 45


def test_plan_report_prompt_generates_daily_report_job():
    plan = build_plan_from_prompt(
        PlannerRequest(
            prompt="Buat laporan harian jam 07:30",
        )
    )

    assert len(plan.jobs) == 1
    job = plan.jobs[0].job_spec
    assert job.type == "report.daily"
    assert job.schedule is not None
    assert job.schedule.cron == "30 7 * * *"


def test_plan_combined_prompt_generates_three_jobs():
    plan = build_plan_from_prompt(
        PlannerRequest(
            prompt="Pantau whatsapp akun ops_01 tiap 30 detik, buat laporan harian jam 08:00, dan backup harian",
        )
    )

    types = {job.job_spec.type for job in plan.jobs}
    assert len(plan.jobs) == 3
    assert types == {"monitor.channel", "report.daily", "backup.export"}


def test_plan_generic_prompt_falls_back_to_agent_workflow():
    plan = build_plan_from_prompt(
        PlannerRequest(
            prompt="Tolong sinkron data github ke notion sekarang",
        )
    )

    assert len(plan.jobs) == 1
    job = plan.jobs[0].job_spec
    assert job.type == "agent.workflow"
    assert job.inputs["prompt"] == "Tolong sinkron data github ke notion sekarang"
