"""
CONTOH JOB TERBERAT - Implementasi Nyata

File ini berisi contoh implementasi job terberat yang bisa langsung dijalankan.
"""

import asyncio
import json
import time
from datetime import datetime
from typing import Any, Dict, List


# ============================================================================
# CONTOH 1: E-COMMERCE PRICE INTELLIGENCE
# ============================================================================

async def ecommerce_price_intelligence(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Job terberat #1: Monitor harga 100 produk di 5 marketplace kompetitor,
    analisis AI, auto-adjust harga.
    
    Resource Usage:
    - Duration: 5-10 menit
    - API Calls: 600+
    - Memory: ~50MB
    """
    start_time = time.time()
    products = inputs.get("products", [])[:100]  # Max 100 products
    marketplaces = inputs.get("marketplaces", ["shopee", "tokopedia", "lazada"])
    pricing_strategy = inputs.get("pricing_strategy", "undercut_by_5_percent")
    
    results = {
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": datetime.now().isoformat(),
        "products_processed": 0,
        "prices_updated": 0,
        "api_calls_made": 0,
        "total_savings": 0,
    }
    
    # STEP 1: Fetch competitor prices (500 API calls)
    print(f"[STEP 1] Fetching competitor prices for {len(products)} products...")
    competitor_prices = {}
    
    for product in products:
        sku = product["sku"]
        competitor_prices[sku] = {}
        
        for marketplace in marketplaces:
            # Simulasi API call ke marketplace
            await asyncio.sleep(0.01)  # 10ms per API call
            results["api_calls_made"] += 1
            
            # Mock response
            competitor_prices[sku][marketplace] = {
                "competitor_a": product["my_price"] * 0.95,
                "competitor_b": product["my_price"] * 0.90,
                "competitor_c": product["my_price"] * 1.05,
            }
    
    print(f"[STEP 1] Completed: {results['api_calls_made']} API calls")
    
    # STEP 2: AI Price Analysis
    print(f"[STEP 2] Analyzing prices with AI...")
    price_recommendations = {}
    
    for product in products:
        sku = product["sku"]
        my_price = product["my_price"]
        
        # Get min competitor price
        all_competitor_prices = []
        for mp in marketplaces:
            all_competitor_prices.extend(competitor_prices[sku][mp].values())
        
        min_competitor_price = min(all_competitor_prices)
        
        # AI recommendation logic
        if min_competitor_price < my_price * 0.90:
            # Competitor significantly cheaper
            recommended_price = min_competitor_price * 0.95  # Undercut by 5%
            action = "decrease_price"
        elif min_competitor_price > my_price * 1.10:
            # We're cheaper, can increase
            recommended_price = my_price * 1.05  # Increase by 5%
            action = "increase_price"
        else:
            # Price competitive
            recommended_price = my_price
            action = "maintain_price"
        
        price_recommendations[sku] = {
            "current_price": my_price,
            "recommended_price": recommended_price,
            "action": action,
            "reason": f"Min competitor: {min_competitor_price:.0f}",
        }
    
    print(f"[STEP 2] AI analysis completed for {len(price_recommendations)} products")
    
    # STEP 3: Update prices (100 API calls)
    print(f"[STEP 3] Updating prices across platforms...")
    
    for product in products:
        sku = product["sku"]
        rec = price_recommendations[sku]
        
        if rec["action"] != "maintain_price":
            # Simulasi update price ke marketplace
            await asyncio.sleep(0.01)
            results["api_calls_made"] += 1
            results["prices_updated"] += 1
            
            if rec["action"] == "decrease_price":
                savings = rec["current_price"] - rec["recommended_price"]
                results["total_savings"] += savings
    
    results["products_processed"] = len(products)
    results["finished_at"] = datetime.now().isoformat()
    results["duration_seconds"] = time.time() - start_time
    
    print(f"[COMPLETE] Processed {results['products_processed']} products, "
          f"updated {results['prices_updated']} prices, "
          f"{results['api_calls_made']} API calls, "
          f"duration: {results['duration_seconds']:.1f}s")
    
    return results


# ============================================================================
# CONTOH 2: MASS MESSAGING CAMPAIGN
# ============================================================================

async def mass_messaging_campaign(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Job terberat #2: Kirim 10,000 messages via WhatsApp, Telegram, Email
    dengan personalisasi AI dan rate limiting.
    
    Resource Usage:
    - Duration: 2-3 jam
    - API Calls: 10,000+
    - Memory: ~200MB
    """
    start_time = time.time()
    total_customers = inputs.get("total_customers", 10000)
    channels = inputs.get("channels", ["whatsapp", "telegram", "email"])
    rate_limit = inputs.get("rate_limit_per_minute", 100)
    
    results = {
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": datetime.now().isoformat(),
        "total_customers": total_customers,
        "messages_sent": 0,
        "messages_failed": 0,
        "api_calls_made": 0,
        "by_channel": {ch: {"sent": 0, "failed": 0} for ch in channels},
    }
    
    # STEP 1: Load and segment customers
    print(f"[STEP 1] Loading {total_customers} customers...")
    await asyncio.sleep(0.1)  # Simulasi load from database
    
    # Segment customers
    vip_customers = int(total_customers * 0.1)  # 10% VIP
    regular_customers = int(total_customers * 0.6)  # 60% Regular
    new_customers = total_customers - vip_customers - regular_customers
    
    print(f"[STEP 1] Segmented: {vip_customers} VIP, {regular_customers} Regular, {new_customers} New")
    
    # STEP 2: Generate personalized messages with AI
    print(f"[STEP 2] Generating personalized messages with AI...")
    await asyncio.sleep(0.5)  # Simulasi AI generation
    
    # STEP 3: Send messages with rate limiting
    print(f"[STEP 3] Sending messages (rate limit: {rate_limit}/min)...")
    
    messages_per_channel = total_customers // len(channels)
    delay_between_messages = 60 / rate_limit  # seconds
    
    for channel in channels:
        channel_sent = 0
        channel_failed = 0
        
        for i in range(messages_per_channel):
            try:
                # Simulasi send message
                await asyncio.sleep(delay_between_messages * 0.01)  # Fast for demo
                results["api_calls_made"] += 1
                channel_sent += 1
                
                # Simulate occasional failures (1% failure rate)
                if i % 100 == 0:
                    channel_failed += 1
                    
            except Exception as e:
                channel_failed += 1
        
        results["messages_sent"] += channel_sent
        results["messages_failed"] += channel_failed
        results["by_channel"][channel] = {"sent": channel_sent, "failed": channel_failed}
        
        print(f"[{channel.upper()}] Sent: {channel_sent}, Failed: {channel_failed}")
    
    results["finished_at"] = datetime.now().isoformat()
    results["duration_seconds"] = time.time() - start_time
    results["success_rate"] = (results["messages_sent"] / total_customers * 100) if total_customers > 0 else 0
    
    print(f"[COMPLETE] Sent {results['messages_sent']}/{total_customers} messages, "
          f"success rate: {results['success_rate']:.1f}%, "
          f"duration: {results['duration_seconds']:.1f}s")
    
    return results


# ============================================================================
# CONTOH 3: DAILY BUSINESS INTELLIGENCE REPORT
# ============================================================================

async def daily_bi_report(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Job terberat #3: Aggregate data dari 50+ sources, AI analysis,
    generate comprehensive BI report.
    
    Resource Usage:
    - Duration: 30-60 menit
    - API Calls: 200+
    - Data Processed: 1M+ rows
    - Memory: ~500MB
    """
    start_time = time.time()
    data_sources = inputs.get("data_sources", [])
    ai_analysis_enabled = inputs.get("ai_analysis", {}).get("enabled", True)
    
    results = {
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": datetime.now().isoformat(),
        "report_date": datetime.now().strftime("%Y-%m-%d"),
        "data_sources_queried": 0,
        "total_records_processed": 0,
        "api_calls_made": 0,
        "insights_generated": 0,
        "reports_generated": [],
    }
    
    # STEP 1: Fetch data from 50+ sources (200 API calls)
    print(f"[STEP 1] Fetching data from {len(data_sources)} sources...")
    
    aggregated_data = {}
    
    for source in data_sources:
        platform = source.get("platform")
        metrics = source.get("metrics", [])
        
        # Fetch each metric (simulasi API call)
        for metric in metrics:
            await asyncio.sleep(0.01)  # 10ms per API call
            results["api_calls_made"] += 1
            
            # Mock data
            if platform not in aggregated_data:
                aggregated_data[platform] = {}
            
            aggregated_data[platform][metric] = {
                "value": 1000000,  # Mock value
                "change_vs_yesterday": 5.2,
                "change_vs_last_week": -2.1,
                "change_vs_last_month": 15.3,
            }
        
        results["data_sources_queried"] += 1
        results["total_records_processed"] += len(metrics) * 10000  # Mock 10K records per metric
    
    print(f"[STEP 1] Completed: {results['api_calls_made']} API calls, "
          f"{results['total_records_processed']} records")
    
    # STEP 2: Data aggregation
    print(f"[STEP 2] Aggregating data...")
    
    total_sales = sum(
        data.get("sales", {}).get("value", 0) 
        for data in aggregated_data.values()
    )
    total_orders = sum(
        data.get("orders", {}).get("value", 0) 
        for data in aggregated_data.values()
    )
    total_visitors = sum(
        data.get("visitors", {}).get("value", 0) 
        for data in aggregated_data.values()
    )
    
    print(f"[STEP 2] Aggregated: Sales={total_sales}, Orders={total_orders}, Visitors={total_visitors}")
    
    # STEP 3: AI Analysis
    if ai_analysis_enabled:
        print(f"[STEP 3] Running AI analysis...")
        await asyncio.sleep(0.5)  # Simulasi AI processing
        
        insights = [
            {
                "type": "anomaly",
                "title": "Sales Turun 20% vs Minggu Lalu",
                "description": "Terutama di marketplace Shopee dan Tokopedia",
                "recommendation": "Cek apakah ada masalah stok atau kompetisi harga",
            },
            {
                "type": "trend",
                "title": "TikTok Ads ROAS Meningkat",
                "description": "ROAS TikTok naik dari 5x menjadi 8x dalam 7 hari terakhir",
                "recommendation": "Increase budget TikTok Ads sebesar 30%",
            },
            {
                "type": "opportunity",
                "title": "Weekend Sales 40% Lebih Tinggi",
                "description": "Penjualan Sabtu-Minggu konsisten 40% lebih tinggi dari weekday",
                "recommendation": "Jalankan flash sale di weekend untuk maksimalkan revenue",
            },
        ]
        
        results["insights_generated"] = len(insights)
        results["ai_insights"] = insights
        
        print(f"[STEP 3] Generated {len(insights)} AI insights")
    
    # STEP 4: Generate reports
    print(f"[STEP 4] Generating reports...")
    
    reports = ["pdf", "excel", "dashboard"]
    for report_type in reports:
        await asyncio.sleep(0.05)  # Simulasi report generation
        results["reports_generated"].append({
            "type": report_type,
            "status": "generated",
            "size_mb": 5.2,
        })
    
    results["finished_at"] = datetime.now().isoformat()
    results["duration_seconds"] = time.time() - start_time
    
    print(f"[COMPLETE] Queried {results['data_sources_queried']} sources, "
          f"processed {results['total_records_processed']} records, "
          f"generated {results['insights_generated']} insights, "
          f"duration: {results['duration_seconds']:.1f}s")
    
    return results


# ============================================================================
# CONTOH 4: MULTI-PLATFORM PRODUCT SYNC
# ============================================================================

async def multi_platform_product_sync(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Job terberat #4: Sync 1,000 products ke 10 platforms dengan
    image processing dan AI optimization.
    
    Resource Usage:
    - Duration: 1-2 jam
    - API Calls: 10,000+
    - Images Processed: 5,000-10,000
    - Memory: ~1GB
    """
    start_time = time.time()
    total_products = inputs.get("total_products", 1000)
    platforms = inputs.get("platforms", ["shopee", "tokopedia", "lazada"])
    sync_images = inputs.get("sync_options", {}).get("sync_images", True)
    ai_optimize = inputs.get("ai_optimization", {}).get("optimize_titles", True)
    
    results = {
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": datetime.now().isoformat(),
        "total_products": total_products,
        "products_synced": 0,
        "products_failed": 0,
        "images_processed": 0,
        "api_calls_made": 0,
        "by_platform": {p: {"synced": 0, "failed": 0} for p in platforms},
    }
    
    # STEP 1: Load products from database
    print(f"[STEP 1] Loading {total_products} products from database...")
    await asyncio.sleep(0.1)  # Simulasi database query
    
    # STEP 2: Image processing
    if sync_images:
        print(f"[STEP 2] Processing images (5-10 per product)...")
        images_per_product = 5
        
        for i in range(total_products):
            for j in range(images_per_product):
                # Simulasi: download, resize, compress, upload
                await asyncio.sleep(0.001)  # 1ms per image
                results["images_processed"] += 1
        
        print(f"[STEP 2] Processed {results['images_processed']} images")
    
    # STEP 3: AI content optimization
    if ai_optimize:
        print(f"[STEP 3] Optimizing content with AI...")
        await asyncio.sleep(0.5)  # Simulasi AI processing
    
    # STEP 4: Sync to platforms (10,000 API calls)
    print(f"[STEP 4] Syncing {total_products} products to {len(platforms)} platforms...")
    
    for platform in platforms:
        platform_synced = 0
        platform_failed = 0
        
        for i in range(total_products):
            try:
                # Simulasi API call ke platform
                await asyncio.sleep(0.001)  # 1ms per API call
                results["api_calls_made"] += 1
                platform_synced += 1
                
                # Simulate occasional failures (2% failure rate)
                if i % 50 == 0:
                    platform_failed += 1
                    
            except Exception as e:
                platform_failed += 1
        
        results["products_synced"] += platform_synced
        results["products_failed"] += platform_failed
        results["by_platform"][platform] = {"synced": platform_synced, "failed": platform_failed}
        
        print(f"[{platform.upper()}] Synced: {platform_synced}, Failed: {platform_failed}")
    
    results["finished_at"] = datetime.now().isoformat()
    results["duration_seconds"] = time.time() - start_time
    results["success_rate"] = (results["products_synced"] / (total_products * len(platforms)) * 100)
    
    print(f"[COMPLETE] Synced {results['products_synced']}/{total_products * len(platforms)} products, "
          f"success rate: {results['success_rate']:.1f}%, "
          f"duration: {results['duration_seconds']:.1f}s")
    
    return results


# ============================================================================
# CONTOH 5: REAL-TIME CRISIS MONITORING
# ============================================================================

async def real_time_crisis_monitoring(ctx, inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Job terberat #5: Monitor 100+ social media accounts, detect brand mentions,
    AI sentiment analysis, real-time alerts.
    
    Resource Usage:
    - Duration: 24/7 continuous
    - API Calls: 48,000/hour
    - Posts Analyzed: 6,000/hour
    - Memory: ~100MB
    """
    start_time = time.time()
    accounts = inputs.get("accounts", [])
    monitor_keywords = inputs.get("monitor_keywords", [])
    sentiment_enabled = inputs.get("sentiment_analysis", {}).get("enabled", True)
    crisis_enabled = inputs.get("crisis_detection", {}).get("enabled", True)
    
    results = {
        "job_id": ctx.job_id,
        "run_id": ctx.run_id,
        "started_at": datetime.now().isoformat(),
        "accounts_monitored": len(accounts),
        "posts_processed": 0,
        "mentions_detected": 0,
        "negative_mentions": 0,
        "alerts_sent": 0,
        "crisis_detected": False,
        "api_calls_made": 0,
    }
    
    # STEP 1: Fetch recent posts from all accounts
    print(f"[STEP 1] Fetching posts from {len(accounts)} accounts...")
    
    all_posts = []
    
    for account in accounts:
        platform = account.get("platform")
        account_name = account.get("account")
        
        # Fetch 100 posts per account (simulasi)
        for i in range(100):
            await asyncio.sleep(0.001)  # 1ms per API call
            results["api_calls_made"] += 1
            
            post = {
                "platform": platform,
                "account": account_name,
                "content": f"Sample post content {i}",
                "timestamp": datetime.now().isoformat(),
                "likes": 100,
                "shares": 10,
                "comments": 5,
            }
            all_posts.append(post)
    
    results["posts_processed"] = len(all_posts)
    print(f"[STEP 1] Fetched {len(all_posts)} posts")
    
    # STEP 2: Filter brand mentions
    print(f"[STEP 2] Filtering brand mentions...")
    
    brand_mentions = []
    
    for post in all_posts:
        # Simple keyword matching (simulasi)
        for keyword in monitor_keywords:
            if keyword.lower() in post["content"].lower():
                brand_mentions.append(post)
                results["mentions_detected"] += 1
                break
    
    print(f"[STEP 2] Detected {results['mentions_detected']} brand mentions")
    
    # STEP 3: AI Sentiment Analysis
    if sentiment_enabled:
        print(f"[STEP 3] Running AI sentiment analysis...")
        
        for mention in brand_mentions:
            # Simulasi AI sentiment analysis
            await asyncio.sleep(0.001)  # 1ms per analysis
            
            # Mock sentiment score (0.0 = very negative, 1.0 = very positive)
            import random
            sentiment_score = random.random()
            mention["sentiment_score"] = sentiment_score
            
            if sentiment_score < 0.3:
                results["negative_mentions"] += 1
                
                # Send alert for negative mentions
                results["alerts_sent"] += 1
        
        print(f"[STEP 3] Analyzed {len(brand_mentions)} mentions, "
              f"{results['negative_mentions']} negative")
    
    # STEP 4: Crisis Detection
    if crisis_enabled:
        print(f"[STEP 4] Checking for crisis...")
        
        negative_ratio = results["negative_mentions"] / results["mentions_detected"] if results["mentions_detected"] > 0 else 0
        
        # Crisis thresholds
        if negative_ratio > 0.8 or results["mentions_detected"] > 100:
            results["crisis_detected"] = True
            results["alerts_sent"] += 3  # Emergency alerts
            
            print(f"[CRISIS] Negative ratio: {negative_ratio:.1%}, "
                  f"Volume: {results['mentions_detected']}")
    
    results["finished_at"] = datetime.now().isoformat()
    results["duration_seconds"] = time.time() - start_time
    
    print(f"[COMPLETE] Processed {results['posts_processed']} posts, "
          f"detected {results['mentions_detected']} mentions, "
          f"sent {results['alerts_sent']} alerts, "
          f"duration: {results['duration_seconds']:.1f}s")
    
    return results


# ============================================================================
# MAIN: Test semua job berat
# ============================================================================

async def main():
    """
    Test semua contoh job terberat
    """
    print("=" * 80)
    print("CONTOH JOB TERBERAT - SPIO AGENT")
    print("=" * 80)
    print()
    
    # Mock context
    class MockCtx:
        job_id = "test-job"
        run_id = "test-run"
        metrics = None
    
    ctx = MockCtx()
    
    # Test Job 1: E-commerce Price Intelligence
    print("\n" + "=" * 80)
    print("JOB 1: E-COMMERCE PRICE INTELLIGENCE")
    print("=" * 80)
    
    inputs_1 = {
        "products": [{"sku": f"PROD{i:03d}", "my_price": 100000} for i in range(100)],
        "marketplaces": ["shopee", "tokopedia", "lazada", "tiktok", "blibli"],
        "pricing_strategy": "undercut_by_5_percent",
    }
    
    result_1 = await ecommerce_price_intelligence(ctx, inputs_1)
    print(f"Result: {json.dumps(result_1, indent=2, default=str)}")
    
    # Test Job 2: Mass Messaging
    print("\n" + "=" * 80)
    print("JOB 2: MASS MESSAGING CAMPAIGN")
    print("=" * 80)
    
    inputs_2 = {
        "total_customers": 1000,  # Reduced for demo
        "channels": ["whatsapp", "telegram", "email"],
        "rate_limit_per_minute": 100,
    }
    
    result_2 = await mass_messaging_campaign(ctx, inputs_2)
    print(f"Result: {json.dumps(result_2, indent=2, default=str)}")
    
    # Test Job 3: BI Report
    print("\n" + "=" * 80)
    print("JOB 3: DAILY BUSINESS INTELLIGENCE REPORT")
    print("=" * 80)
    
    inputs_3 = {
        "data_sources": [
            {"platform": "shopee", "metrics": ["sales", "orders", "visitors"]},
            {"platform": "tokopedia", "metrics": ["sales", "orders", "visitors"]},
            {"platform": "facebook_ads", "metrics": ["spend", "impressions", "clicks"]},
            {"platform": "google_ads", "metrics": ["spend", "impressions", "clicks"]},
            {"platform": "instagram", "metrics": ["followers", "engagement"]},
        ],
        "ai_analysis": {"enabled": True},
    }
    
    result_3 = await daily_bi_report(ctx, inputs_3)
    print(f"Result: {json.dumps(result_3, indent=2, default=str)}")
    
    # Test Job 4: Product Sync
    print("\n" + "=" * 80)
    print("JOB 4: MULTI-PLATFORM PRODUCT SYNC")
    print("=" * 80)
    
    inputs_4 = {
        "total_products": 100,  # Reduced for demo
        "platforms": ["shopee", "tokopedia", "lazada", "tiktok"],
        "sync_options": {"sync_images": True},
        "ai_optimization": {"optimize_titles": True},
    }
    
    result_4 = await multi_platform_product_sync(ctx, inputs_4)
    print(f"Result: {json.dumps(result_4, indent=2, default=str)}")
    
    # Test Job 5: Crisis Monitoring
    print("\n" + "=" * 80)
    print("JOB 5: REAL-TIME CRISIS MONITORING")
    print("=" * 80)
    
    inputs_5 = {
        "accounts": [
            {"platform": "instagram", "account": "brand_official"},
            {"platform": "twitter", "account": "@brand"},
            {"platform": "tiktok", "account": "@brand"},
            {"platform": "facebook", "account": "BrandPage"},
        ],
        "monitor_keywords": ["brand", "product"],
        "sentiment_analysis": {"enabled": True},
        "crisis_detection": {"enabled": True},
    }
    
    result_5 = await real_time_crisis_monitoring(ctx, inputs_5)
    print(f"Result: {json.dumps(result_5, indent=2, default=str)}")
    
    print("\n" + "=" * 80)
    print("SEMUA JOB BERAT SELESAI DI-TEST!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
