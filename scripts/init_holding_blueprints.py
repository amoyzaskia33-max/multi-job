import asyncio
from app.core.branches import upsert_blueprint

async def init_blueprints():
    # 1. Digital Agency Blueprint
    agency_bp = {
        "blueprint_id": "bp_agency_digital",
        "name": "Digital Agency Unit",
        "description": "Providing automated digital services to clients.",
        "base_strategy": "Identify local businesses with poor digital presence, offer automation services, and close via personalized outreach.",
        "default_jobs": [
            {"role": "hunter", "prompt": "Scrape marketplace/Google for businesses needing automation."},
            {"role": "marketer", "prompt": "Send personalized service proposals to leads."},
            {"role": "closer", "prompt": "Handle replies, negotiate pricing, and send payment links."}
        ]
    }
    
    # 2. Website Sales Blueprint
    web_bp = {
        "blueprint_id": "bp_website_sales",
        "name": "Website Product Sales",
        "description": "Selling pre-built websites or digital products.",
        "base_strategy": "Find trending product niches, observe top sellers, and sell improved versions via automated funnels.",
        "default_jobs": [
            {"role": "hunter", "prompt": "Identify trending products on Amazon/Shopee."},
            {"role": "marketer", "prompt": "Generate and post social media content for the products."},
            {"role": "closer", "prompt": "Process orders and verify payments."}
        ]
    }
    
    await upsert_blueprint(agency_bp)
    await upsert_blueprint(web_bp)
    print("Holding Company Blueprints initialized.")

if __name__ == "__main__":
    asyncio.run(init_blueprints())
