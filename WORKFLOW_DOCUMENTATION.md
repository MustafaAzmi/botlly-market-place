# Botly WhatsApp Workflow Documentation

## Customer Flow Overview (الفلو الجديد المُحسّن)

### Phase 1: Entry & Welcome
**Trigger**: New customer or `ACTION_NEW_SEARCH`
- **Session Check**: Does customer have active session?
  - ✅ YES: Jump to their last phase
  - ❌ NO: Start workflow

**Response**: "هلا بيك في Botly. شنو تحب تسوي؟" + Button: "أريد منتج معين"

---

### Phase 2: Location Request (`awaiting_location`)
**Trigger**: Customer presses "أريد منتج معين" OR `ACTION_FIND_PRODUCT`

**Check Location History**:
- ✅ Has known location (from previous visit or same session)
  - **Skip location request** → Jump to Phase 3
- ❌ No known location
  - **Request location**: "حتى أطلعلك أقرب المتاجر والمنتجات، أرسل موقعك الحالي."
  - **Wait** for `phase = awaiting_location` + location data

**What's New**: 
- ✅ When location arrives → **Go straight to Phase 3** (no button click needed)
- 🗑️ **Removed** the old "awaiting_product_button" phase that was asking "اضغط الزر واكتب"

---

### Phase 3: Product Query (`awaiting_product_query`)
**Trigger**: Location received OR customer already has known location

**Response**: "اكتب اسم المنتج أو وصفه، مثل: تيشيرت أبيض سادة، قاعدة موبايل ايفون، لصقة شاشة هواوي."

**What Changed**:
- ✅ Customer **types product name directly** (no intermediate button)
- ✅ Bot waits for text in `awaiting_product_query` phase
- ✅ Any text input → search starts immediately

---

### Phase 4: Search & Results (`awaiting_selection`)
**Trigger**: Customer types product name (min 2 chars) in `awaiting_product_query`

**Process**:
1. Parse intent from customer text
2. Search products (location-aware, 15km radius)
3. Show top 3 results with **images & price**
4. Buttons: 1️⃣ 2️⃣ 3️⃣ [More Results] [New Search]

**Buttons**:
- `ACTION_MORE_RESULTS`: Show next 3 products
- Product selection (1, 2, 3 or text parsing)

---

### Phase 5: Product Selection & Order (`awaiting_after_selection`)
**Trigger**: Customer selects a product

**Response**:
- Product details (title, price, merchant, image)
- Buttons:
  - "اراسل التاجر" → `ACTION_MESSAGE_MERCHANT` (contact merchant on WhatsApp)
  - "بحث جديد" → `ACTION_NEW_SEARCH` (restart)
  - "شي اخر" → Alternative search

**Order Flow** (if merchant has delivery):
- Asks customer name
- Asks landmark/location (جامع، شارع معروف)
- Asks governorate
- Confirms order → Notifies merchant

---

## Workflow Phases Map

```
┌─────────────────────────────────────────────┐
│         Customer Sends Message              │
└──────────────┬──────────────────────────────┘
               │
        ┌──────▼──────────────┐
        │  Existing Session?  │
        └─────┬──────────┬────┘
             YES         NO
              │           │
              │      ┌────▼──────────┐
              │      │  Start Phase  │
              │      │ Request: What │
              │      │   to search?  │
              │      └────┬──────────┘
              │           │
        ┌─────▼───────────▼─────────┐
        │   actionId = FIND_PRODUCT │
        │  OR phase = awaiting_*    │
        └─────┬─────────────────────┘
              │
        ┌─────▼────────────────────┐
        │  Has Known Location?     │
        └─────┬──────────┬─────────┘
             YES         NO
              │           │
              │      ┌────▼──────────────┐
              │      │ awaiting_location │
              │      │ Request: موقعك    │
              │      └────┬──────────────┘
              │           │
        ┌─────▼────────────▼─────────────┐
        │  awaiting_product_query        │
        │  Request: اسم المنتج؟          │
        └─────┬────────────────────────┘
              │
        ┌─────▼──────────────────────┐
        │ Search & Show 3 Results    │
        │ awaiting_selection         │
        └─────┬────────────────────┬─┘
              │                    │
        ┌─────▼──┐         ┌──────▼─────┐
        │Selected│         │More Results│
        │Product │         └──────┬─────┘
        └─────┬──┘                │
              │      ┌────────────┘
        ┌─────▼──────▼───────────┐
        │ awaiting_after_selection│
        │ Message Merchant / Order│
        └────────────────────────┘
```

---

## Key Changes (July 2025)

### What Changed?
❌ **REMOVED**: `awaiting_product_button` phase
  - Was asking: "اضغط الزر واكتب اسم المنتج"
  - Created unnecessary step
  - Caused workflow stalls

✅ **ADDED**: Direct flow from location → product query
  - After location: ask product name directly
  - Customer types name → search starts immediately
  - **1 fewer step** = faster experience

### Why?
- **User Experience**: Customers got confused by extra button
- **Faster**: 1 less message round-trip
- **Simpler**: Cleaner state machine logic

### Migration
- Existing sessions in `awaiting_product_button` still work (phase exists in legacy types)
- New customers use the streamlined flow
- No breaking changes to API

---

## Debug: How to Test

### Test Case 1: New Customer, No Location History
```
1. Send any message
→ Bot: "هلا بيك في Botly. شنو تحب تسوي؟" [Find Product]
2. Tap button
→ Bot: "أرسل موقعك"
3. Send location (tap 📍)
→ Bot: "اكتب اسم المنتج" (awaiting_product_query — direct!)
4. Type "تيشيرت أحمر"
→ Bot: 3 results + prices + merchant names
```

### Test Case 2: Returning Customer, Has Known Location
```
1. Send message
→ Bot: "اكتب اسم المنتج" (skip location!)
2. Type "جاكيت"
→ Bot: 3 results with images
```

### Test Case 3: Location Update Mid-Search
```
1. In awaiting_selection phase
2. Send new location
→ Bot: Updates location, stays in search context, asks product again
```

---

## Common Issues & Fixes

### Issue: Bot says "request location" repeatedly
**Cause**: Customer didn't grant location permission
**Fix**: 
- Send fallback message with manual location buttons
- Or let customer continue by typing product name (not location required)

### Issue: Workflow stuck in "awaiting_product_query"
**Cause**: Empty message, or <2 character search
**Fix**: 
- Bot responds: "اكتب اسم المنتج بشكل أوضح"
- Stays in same phase, re-prompts

### Issue: Search returns 0 results
**Cause**: No merchants near location, or no matching products
**Fix**: 
- Bot: "ما لكيت نفس الطلب، تحب أبحثلك عن بديل؟"
- Buttons: "بحث عن بديل" OR "بحث جديد"

---

## Performance Notes

### Database Access
- **Session Storage**: `botly_customer_session` — stores phase, location, search context
- **Outbound Guard**: `botly_outbound_guard` — prevents duplicate message spam (10 min window)
- **Product Search**: `botly_product` — event-sourced product list

### Message Guard
- Messages are deduplicated by `wa_message_id` (WhatsApp message ID)
- Prevents double-processing webhook retries
- Silent 200 response if duplicate

### Location Search
- Radius: 15km from customer location
- Limit: 10 products in memory, show 3 at a time
- Distance-aware ranking (closer stores first)

---

## Future Improvements

### Potential Enhancements
1. **Voice Search**: Record product voice queries (already have video feature)
2. **Saved Searches**: Let customer save "تيشيرت أحمر" for faster repeat searches
3. **Merchant Live Chat**: Seamless handoff to merchant (instead of notification)
4. **Payment Integration**: Complete order flow in WhatsApp (now requires merchant follow-up)
5. **Smart Suggestions**: "Customers also looked for X" after selection

---

## Code References

**Main Handler**: `src/routes/api/whatsapp/webhook.ts:handleButtonWorkflow()`

**Key Functions**:
- `readCustomerSession()` — Load session state
- `writeCustomerSession()` — Update phase & context
- `searchProducts()` — Location-aware search
- `extractSearchIntent()` — Parse customer query
- `sendWhatsAppText/Buttons/LocationRequest()` — Send messages
