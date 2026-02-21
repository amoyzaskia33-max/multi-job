from app.core.integration_catalog import (
    get_mcp_server_template,
    get_provider_template,
    list_mcp_server_templates,
    list_provider_templates,
)


def test_provider_catalog_contains_expected_entries():
    providers = list_provider_templates()
    provider_ids = {row["provider"] for row in providers}

    assert "openai" in provider_ids
    assert "github" in provider_ids
    assert "shopee" in provider_ids
    assert "facebook_graph" in provider_ids
    assert "tiktok_open" in provider_ids
    assert len(providers) >= 20


def test_mcp_catalog_contains_expected_entries():
    templates = list_mcp_server_templates()
    template_ids = {row["template_id"] for row in templates}

    assert "mcp_github" in template_ids
    assert "mcp_filesystem" in template_ids
    assert "mcp_tiktok_proxy" in template_ids
    assert "mcp_firecrawl" in template_ids
    assert len(templates) >= 8


def test_template_lookup_is_case_insensitive():
    provider = get_provider_template("Shopee")
    mcp = get_mcp_server_template("MCP_GITHUB")

    assert provider is not None
    assert provider["provider"] == "shopee"
    assert mcp is not None
    assert mcp["server_id"] == "mcp_github"
