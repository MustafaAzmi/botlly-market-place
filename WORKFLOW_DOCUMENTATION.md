# Botly WhatsApp Workflow Documentation

## Customer Flow Overview (الفلو المُبسّط الجديد)

### Phase 1: Product Search (Immediate)
**Trigger**: Customer sends ANY message

**Response** (Instant, no buttons):
```
اهلا عيني شلون الصحة 👋

اكتب اسم أو وصف المنتج الي ادور عليه. 
ممكن تكتب سعر بحدود كذا وي الوصف. 

مثلاً: تيشيرت أحمر
       تيشيرت أقل من ٥٠ ألف
       جاكيت شتوي
       إلخ
```

**Key Changes (June 2026)**:
- ✅ **NO greeting with button** — any message triggers search directly
- ✅ **AI understands everything** — typos, "ة" vs "ه", Iraqi dialect, prices
  - Example: "تيشيرت احمر" or "تيشيرد احمر" → both understand as "تيشيرت أحمر"
  - Example: "تحت ٥٠" → AI extracts `maxPrice: 50000`

---

### Phase 2: Search & Results (`awaiting_selection`)
**Trigger**: Customer types product description

**Process**:
1. Claude/OpenAI parses: product name, color, size, price range
2. Search **all visible merchants** (nationwide, no radius)
3. Show top 3 results with images + price + store name
4. Buttons: `1️⃣ 2️⃣ 3️⃣ [More Results]`

---

### Phase 3a: Confirm Saved Address (`awaiting_address_confirmation`)
**Trigger**: Customer selected product → clicks "اكمال الشراء"

**If customer has saved address from previous order:**
```
عنوانك الحالي:
الاسم: محمد | النقطة الدالة: جامع الكفاية | المحافظة: بغداد

هذا الحنين بتاع الطلب؟
```
**Buttons**: `[نعم، نفسه] [لا، بدل العنوان]`

- **"نعم، نفسه"** → Complete order immediately (skip the 3-step form)
- **"لا، بدل العنوان"** → Start 3-step form from scratch

---

### Phase 3b: Order Details (`awaiting_customer_name` → `landmark` → `governorate`)
**Trigger**: 
- First order (no saved address), OR
- Customer chooses "change address"

**Three-step form** (asks one field at a time):
1. "شنو اسمك الكامل؟"
2. "شنو أقرب نقطة دالة على موقعك؟ (جامع، مدرسة، شارع)"
3. "شنو المحافظة؟"

**After completion**:
- ✅ **Save address to database** (linked to customer phone number)
- Next order from same customer: show confirmation screen directly (Phase 3a)

---

## Workflow Phases Map

```
┌─────────────────────────────────────────────┐
│  Customer Sends ANY Text Message            │
└──────────────┬──────────────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │  awaiting_product_query     │
        │  "اهلا عيني، اكتب منتج؟"    │
        │  (AI parses product/price)  │
        └─────┬────────────────────┬──┘
              │                    │
        ┌─────▼──────────────────┐ │
        │ Search & Show Results  │ │
        │ awaiting_selection     │ │
        │ (3 matches + images)   │ │
        └─────┬────────────────┬─┘ │
              │ (select 1-3)   │   │
        ┌─────▼──┐      ┌──────▼──────┐
        │Selected│      │More Results │
        │Product │      └──────┬──────┘
        └─────┬──┘             │
              │   ┌────────────┘
        ┌─────▼──────▼────────────┐
        │                         │
        │ Has saved address? ─────┼────────────┐
        │                    Yes / No           │
        │                         │             │
        │ ┌──────────────────┐    │             │
        │ │Address          │    │             │
        │ │Confirmation     │    │             │
        │ │awaiting_address │    │             │
        │ │_confirmation    │    │             │
        │ └────────┬────────┘    │             │
        │          │             │             │
        │   [Yes] [Change]       │             │
        │     │       │          │             │
        │     │   ┌───┴──────────┘             │
        │     │   │                           │
        │     │   │ ┌───────────────────────┐ │
        │     │   └─► awaitingcustomer_name │ │
        │     │      input name       │      │ │
        │     │      ↓                 │      │ │
        │     │      awaitingcustomer_│      │ │
        │     │      landmark         │      │ │
        │     │      ↓                 │      │ │
        │     │      awaitingcustomer │      │ │
        │     │      _governorate     │      │ │
        │     │                       │      │ │
        │     └───────────────────────┤──────┘ │
        │                             │         │
        │ ┌──────────────────────────▼────────┐│
        │ │ Save Order + Address               ││
        │ │ Send to merchant/delivery          ││
        │ └───────────────────────────────────┘│
        │                                       │
        │ "تم الطلب! تحب تبحث عن منتج ثاني؟"    │
        │ [بحث جديد]                           │
        │ ↓ (loops back to Phase 1)            │
        └───────────────────────────────────────┘
```

---

## AI Understanding (Critical)

The bot must use Claude (Anthropic API) or OpenAI to parse customer intent:

### Examples AI must handle:
- "تيشيرت احمر" → "تيشيرت أحمر" (typo fix)
- "تيشيرد احمر" → "تيشيرت أحمر" (hamza/diacritics)
- "بنطرون جينز" → detects "بنطلون" + "جينز"
- "ما تتجاوز ٥٠" → extracts `maxPrice: 50000`
- "تحت ١٠٠ الف" → extracts `maxPrice: 100000`
- Iraqi dialect: "تاي الشنطة" → recognizes as "شنطة" (bag)

### Prompt handles:
- Spelling corrections
- Hamza/Alef normalization ("أ" = "ا" = "إ")
- Singular/plural detection
- Brand names + synonyms
- Price parsing (written Arabic numbers → digits)

---

## Database: Saved Addresses

### Table: `botly_customer_session` (orderDetails field)

When customer completes an order, store:
```json
{
  "orderDetails": {
    "name": "محمد علي",
    "landmark": "جامع الكفاية",
    "governorate": "بغداد"
  }
}
```

### Lookup Flow
1. Customer selects product → clicks "اكمال الشراء"
2. Bot searches `botly_customer_session` for last `orderDetails` with name + landmark + governorate
3. If found → show `confirmAddressResponse()` (Phase 3a)
4. If not found → start 3-step form (Phase 3b)

---

## Test Cases

### Test 1: Brand New Customer
```
1. Send: "جاكيت احمر"
→ Instant: "اهلا عيني... اكتب منتج؟"
   Wait, they already sent product! Search results:
→ 3 products with images [1️⃣ 2️⃣ 3️⃣ More]
2. Tap: 1️⃣
→ "اختيرت: جاكيت احمر حريمي..."
   [اكمال الشراء] [رسالة للتاجر]
3. Tap: اكمال الشراء
→ "شنو اسمك الكامل؟"
4. Send: "فاطمة"
→ "شكراً فاطمة! أقرب نقطة دالة؟"
5. Send: "جامع الشهداء"
→ "ممتاز! المحافظة؟"
6. Send: "كربلاء"
→ "تم! طلبك أُرسل 🎉"
   [بحث جديد]
```

### Test 2: Returning Customer (Saved Address)
```
1. Send: "تيشيرت"
→ "اهلا عيني... اكتب منتج؟"
→ [Search] 3 results
2. Tap: 2️⃣
→ "اختيرت: تيشيرت أحمر..."
   [اكمال الشراء] [رسالة للتاجر]
3. Tap: اكمال الشراء
→ "عنوانك الحالي:
    الاسم: فاطمة | النقطة: جامع الشهداء | المحافظة: كربلاء
    هذا الحنين؟"
   [نعم، نفسه] [لا، بدل العنوان]
4. Tap: [نعم، نفسه]
→ "تم! طلبك أُرسل 🎉" (order sent immediately)
   [بحث جديد]
```

### Test 3: Change Address
```
(Same as Test 2, but at step 4 tap [لا، بدل العنوان])
4. Tap: [لا، بدل العنوان]
→ "شنو اسمك الكامل؟" (restart 3-step form)
```

---

## Code References

**Main Handler**: `src/routes/api/whatsapp/webhook.ts:handleButtonWorkflow()`

**Key Functions**:
- `startWorkflowResponse()` → Greeting + product search prompt
- `findLastSavedAddress(customerNumber)` → Load saved address from DB
- `confirmAddressResponse(savedAddress)` → Show confirmation screen
- `searchProducts(intent)` → Search nationwide (Claude/OpenAI parsing)
- `writeCustomerSession()` → Store phase + matches + address

**Phases**:
- `awaiting_product_query` → Waiting for product description
- `awaiting_selection` → Showing 3 results
- `awaiting_address_confirmation` → Confirm or change saved address
- `awaiting_customer_name/landmark/governorate` → 3-step form
