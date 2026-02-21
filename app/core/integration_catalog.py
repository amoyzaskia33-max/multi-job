from typing import Any, Dict, List, Optional

PROVIDER_TEMPLATES: List[Dict[str, Any]] = [
    {
        "provider": "openai",
        "label": "OpenAI",
        "description": "Model LLM dan reasoning untuk planner/agent.",
        "auth_hint": "OPENAI_API_KEY",
        "default_account_id": "default",
        "default_enabled": True,
        "default_config": {"base_url": "https://api.openai.com/v1", "model_id": "gpt-4o-mini"},
    },
    {
        "provider": "anthropic",
        "label": "Anthropic",
        "description": "Alternatif LLM untuk workflow agent.",
        "auth_hint": "ANTHROPIC_API_KEY",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.anthropic.com", "model_id": "claude-3-5-sonnet-latest"},
    },
    {
        "provider": "gemini",
        "label": "Google Gemini",
        "description": "LLM Gemini API untuk analisis tambahan.",
        "auth_hint": "GEMINI_API_KEY",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://generativelanguage.googleapis.com", "model_id": "gemini-1.5-pro"},
    },
    {
        "provider": "groq",
        "label": "Groq",
        "description": "Inference cepat untuk use-case latency rendah.",
        "auth_hint": "GROQ_API_KEY",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.groq.com/openai/v1", "model_id": "llama-3.1-70b-versatile"},
    },
    {
        "provider": "github",
        "label": "GitHub",
        "description": "Akses repo, issue, PR, dan automasi development.",
        "auth_hint": "GITHUB_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.github.com"},
    },
    {
        "provider": "notion",
        "label": "Notion",
        "description": "Sinkronisasi knowledge base, docs, dan task notes.",
        "auth_hint": "NOTION_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.notion.com/v1", "notion_version": "2022-06-28"},
    },
    {
        "provider": "linear",
        "label": "Linear",
        "description": "Akses issue tracking dan workflow engineering.",
        "auth_hint": "LINEAR_API_KEY",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.linear.app/graphql"},
    },
    {
        "provider": "slack",
        "label": "Slack",
        "description": "Notifikasi dan command workflow ke channel Slack.",
        "auth_hint": "SLACK_BOT_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://slack.com/api"},
    },
    {
        "provider": "discord",
        "label": "Discord",
        "description": "Integrasi bot dan notifikasi channel Discord.",
        "auth_hint": "DISCORD_BOT_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://discord.com/api/v10"},
    },
    {
        "provider": "telegram_api",
        "label": "Telegram API",
        "description": "Akses API Telegram non-bridge untuk workflow kustom.",
        "auth_hint": "TELEGRAM_BOT_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.telegram.org"},
    },
    {
        "provider": "whatsapp_api",
        "label": "WhatsApp API",
        "description": "Integrasi WhatsApp Business API provider.",
        "auth_hint": "WHATSAPP_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://graph.facebook.com/v20.0"},
    },
    {
        "provider": "shopee",
        "label": "Shopee",
        "description": "Konektor riset produk dan harga marketplace Shopee.",
        "auth_hint": "SHOPEE_PARTNER_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://partner.shopeemobile.com", "region": "id"},
    },
    {
        "provider": "tokopedia",
        "label": "Tokopedia",
        "description": "Konektor katalog dan order Tokopedia.",
        "auth_hint": "TOKOPEDIA_API_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://fs.tokopedia.net", "region": "id"},
    },
    {
        "provider": "lazada",
        "label": "Lazada",
        "description": "Konektor API Lazada untuk data produk/order.",
        "auth_hint": "LAZADA_APP_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.lazada.co.id/rest", "region": "id"},
    },
    {
        "provider": "tiktok_shop",
        "label": "TikTok Shop",
        "description": "Konektor TikTok Shop untuk sinkron produk dan penjualan.",
        "auth_hint": "TIKTOK_SHOP_TOKEN",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://open-api.tiktokglobalshop.com", "region": "id"},
    },
    {
        "provider": "google_sheets",
        "label": "Google Sheets",
        "description": "Sinkron data tabel dari/ke Google Sheets.",
        "auth_hint": "GOOGLE_SERVICE_ACCOUNT_JSON",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"spreadsheet_id": "", "base_url": "https://sheets.googleapis.com/v4/spreadsheets"},
    },
    {
        "provider": "airtable",
        "label": "Airtable",
        "description": "CRUD record untuk operasi ringan seperti CRM/ops.",
        "auth_hint": "AIRTABLE_API_KEY",
        "default_account_id": "default",
        "default_enabled": False,
        "default_config": {"base_url": "https://api.airtable.com/v0"},
    },
]

MCP_SERVER_TEMPLATES: List[Dict[str, Any]] = [
    {
        "template_id": "mcp_github",
        "server_id": "mcp_github",
        "label": "MCP GitHub",
        "description": "MCP server untuk akses repo dan issue GitHub.",
        "transport": "stdio",
        "command": "npx -y @modelcontextprotocol/server-github",
        "args": [],
        "url": "",
        "headers": {},
        "env": {"GITHUB_TOKEN": ""},
        "timeout_sec": 20,
        "default_enabled": False,
    },
    {
        "template_id": "mcp_filesystem",
        "server_id": "mcp_filesystem",
        "label": "MCP Filesystem",
        "description": "MCP untuk baca/tulis file lokal.",
        "transport": "stdio",
        "command": "npx -y @modelcontextprotocol/server-filesystem",
        "args": ["."],
        "url": "",
        "headers": {},
        "env": {},
        "timeout_sec": 20,
        "default_enabled": False,
    },
    {
        "template_id": "mcp_fetch",
        "server_id": "mcp_fetch",
        "label": "MCP Fetch",
        "description": "MCP HTTP fetch untuk ekstraksi konten web.",
        "transport": "stdio",
        "command": "npx -y @modelcontextprotocol/server-fetch",
        "args": [],
        "url": "",
        "headers": {},
        "env": {},
        "timeout_sec": 20,
        "default_enabled": False,
    },
    {
        "template_id": "mcp_memory",
        "server_id": "mcp_memory",
        "label": "MCP Memory",
        "description": "MCP memory store untuk context jangka panjang.",
        "transport": "stdio",
        "command": "npx -y @modelcontextprotocol/server-memory",
        "args": [],
        "url": "",
        "headers": {},
        "env": {},
        "timeout_sec": 20,
        "default_enabled": False,
    },
    {
        "template_id": "mcp_playwright",
        "server_id": "mcp_playwright",
        "label": "MCP Playwright",
        "description": "MCP browser automation untuk scraping terkontrol.",
        "transport": "stdio",
        "command": "npx -y @executeautomation/playwright-mcp-server",
        "args": [],
        "url": "",
        "headers": {},
        "env": {},
        "timeout_sec": 30,
        "default_enabled": False,
    },
    {
        "template_id": "mcp_shopee_proxy",
        "server_id": "mcp_shopee_proxy",
        "label": "MCP Shopee Proxy",
        "description": "Contoh MCP HTTP untuk riset Shopee via service internal.",
        "transport": "http",
        "command": "",
        "args": [],
        "url": "https://api.example.com/mcp/shopee",
        "headers": {},
        "env": {},
        "timeout_sec": 20,
        "default_enabled": False,
    },
]


def list_provider_templates() -> List[Dict[str, Any]]:
    return [dict(row) for row in PROVIDER_TEMPLATES]


def list_mcp_server_templates() -> List[Dict[str, Any]]:
    return [dict(row) for row in MCP_SERVER_TEMPLATES]


def get_provider_template(provider: str) -> Optional[Dict[str, Any]]:
    normalized = provider.strip().lower()
    for row in PROVIDER_TEMPLATES:
        if str(row.get("provider") or "").strip().lower() == normalized:
            return dict(row)
    return None


def get_mcp_server_template(template_id: str) -> Optional[Dict[str, Any]]:
    normalized = template_id.strip().lower()
    for row in MCP_SERVER_TEMPLATES:
        if str(row.get("template_id") or "").strip().lower() == normalized:
            return dict(row)
    return None

