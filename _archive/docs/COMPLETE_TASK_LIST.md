# Complete Task List - Promotional System & Banners

## 📋 MASTER TASK LIST

**Total Tasks**: 87  
**Completed**: 30 ✅  
**Pending**: 57 ❌  
**Progress**: 34%

---

## PHASE 1: BACKEND - BANNER SYSTEM (Priority: HIGH)

### Task 1: Banner Model ✅ COMPLETED
**File**: `backend/src/models/Banner.js`
- [x] Create Banner schema with all fields
- [x] Add bannerScope (TENANT/GLOBAL)
- [x] Add linkedPromotion support
- [x] Add analytics tracking methods
- [x] Add validation methods (isValid, canDisplay)
- [x] Add indexes for performance
**Estimated Time**: 2 hours | **Actual**: 2 hours

### Task 2: Admin Banner Controller ✅ COMPLETED
**File**: `backend/src/controllers/admin/bannerController.js`
- [x] `getTenantBanners()` - List tenant banners
- [x] `getBannerById()` - Get single banner
- [x] `createTenantBanner()` - Create banner
- [x] `updateTenantBanner()` - Update banner
- [x] `deleteTenantBanner()` - Delete banner
- [x] `toggleBannerStatus()` - Activate/deactivate
- [x] `getBannerAnalytics()` - View analytics
- [x] `uploadBannerImage()` - Upload image
**Estimated Time**: 4 hours | **Actual**: 4 hours

### Task 3: SuperAdmin Banner Controller ✅ COMPLETED
**File**: `backend/src/controllers/superAdmin/bannerController.js`
- [x] `getAllBanners()` - List all banners
- [x] `createGlobalBanner()` - Create global banner
- [x] `updateBanner()` - Update any banner
- [x] `deleteBanner()` - Delete any banner
- [x] `approveBanner()` - Approve/reject banner
- [x] `toggleBannerStatus()` - Pause/resume
- [x] `getPlatformAnalytics()` - Platform stats
- [x] `disableBanner()` - Emergency disable
**Estimated Time**: 4 hours | **Actual**: 4 hours

### Task 4: Customer Banner Controller ✅ COMPLETED
**File**: `backend/src/controllers/customer/bannerController.js`
- [x] `getActiveBanners()` - Get banners for page
- [x] `recordBannerImpression()` - Track view
- [x] `recordBannerClick()` - Track click
**Estimated Time**: 1 hour | **Actual**: 1 hour

### Task 5: Banner Routes ✅ COMPLETED
**Files**: 
- `backend/src/routes/admin/bannerRoutes.js`
- `backend/src/routes/superAdmin/bannerRoutes.js`
- `backend/src/routes/customer/bannerRoutes.js`
- [x] Create admin banner routes (8 endpoints)
- [x] Create superadmin banner routes (8 endpoints)
- [x] Create customer banner routes (3 endpoints)
- [x] Add to main app.js
**Estimated Time**: 2 hours | **Actual**: 2 hours

### Task 6: Image Upload Service ✅ COMPLETED
**File**: `backend/src/services/imageUploadService.js`
- [x] Setup multer for file uploads
- [x] Create upload function with Sharp optimization
- [x] Add image validation (size, format, dimensions)
- [x] Add image optimization (resize, compress, format conversion)
- [x] Create delete function
- [x] Add thumbnail generation
- [x] Add local storage support
**Estimated Time**: 3 hours | **Actual**: 3 hours

**PHASE 1 TOTAL**: 16 hours (2 days) ✅ COMPLETED

---

## PHASE 2: FRONTEND - ADMIN BANNER MANAGEMENT (Priority: HIGH)

### Task 7: Admin Banner List Page ❌
**File**: `frontend/src/app/admin/banners/page.tsx`
- [ ] Create banner list page
- [ ] Add search and filters
- [ ] Add pagination
- [ ] Add status badges
- [ ] Add analytics preview
- [ ] Add create button
**Estimated Time**: 3 hours

### Task 8: Create Banner Modal ❌
**File**: `frontend/src/components/banners/CreateBannerModal.tsx`
- [ ] Create modal component
- [ ] Add form fields (title, description, type)
- [ ] Add image upload
- [ ] Add promotion linking dropdown
- [ ] Add target pages selection
- [ ] Add date range picker
- [ ] Add priority input
- [ ] Add validation
**Estimated Time**: 4 hours

### Task 9: Edit Banner Modal ❌
**File**: `frontend/src/components/banners/EditBannerModal.tsx`
- [ ] Create edit modal
- [ ] Pre-fill existing data
- [ ] Add update functionality
- [ ] Add delete confirmation
**Estimated Time**: 2 hours

### Task 10: Banner Preview Component ❌
**File**: `frontend/src/components/banners/BannerPreview.tsx`
- [ ] Create preview component
- [ ] Show desktop preview
- [ ] Show mobile preview
- [ ] Add live preview updates
**Estimated Time**: 2 hours

### Task 11: Banner Analytics Component ❌
**File**: `frontend/src/components/banners/BannerAnalytics.tsx`
- [ ] Create analytics dashboard
- [ ] Show impressions, clicks, conversions
- [ ] Add charts (line, bar)
- [ ] Add date range filter
- [ ] Show CTR and conversion rate
**Estimated Time**: 3 hours

### Task 12: Image Uploader Component ❌
**File**: `frontend/src/components/banners/ImageUploader.tsx`
- [ ] Create drag-drop uploader
- [ ] Add image preview
- [ ] Add crop functionality
- [ ] Add validation
- [ ] Show upload progress
**Estimated Time**: 3 hours

**PHASE 2 TOTAL**: 17 hours (2 days)

---

## PHASE 3: FRONTEND - SUPERADMIN BANNER MANAGEMENT (Priority: MEDIUM)

### Task 13: SuperAdmin Banner Page ❌
**File**: `frontend-superadmin/src/app/superadmin/banners/page.tsx`
- [ ] Create banner management page
- [ ] Show all banners (tenant + global)
- [ ] Add scope filter
- [ ] Add tenancy filter
- [ ] Add approval queue section
**Estimated Time**: 3 hours

### Task 14: Global Banner Creation ❌
**File**: `frontend-superadmin/src/components/banners/CreateGlobalBanner.tsx`
- [ ] Create global banner form
- [ ] Add tenancy selection (multi-select)
- [ ] Add approval rules
- [ ] Add budget settings
**Estimated Time**: 3 hours

### Task 15: Banner Approval Queue ❌
**File**: `frontend-superadmin/src/components/banners/ApprovalQueue.tsx`
- [ ] Create approval queue component
- [ ] Show pending banners
- [ ] Add approve/reject buttons
- [ ] Add rejection reason input
- [ ] Add preview before approval
**Estimated Time**: 3 hours

### Task 16: Platform Analytics ❌
**File**: `frontend-superadmin/src/components/banners/PlatformAnalytics.tsx`
- [ ] Create platform-wide analytics
- [ ] Show total impressions/clicks
- [ ] Compare tenant vs global performance
- [ ] Add top performing banners
**Estimated Time**: 3 hours

**PHASE 3 TOTAL**: 12 hours (1.5 days)

---

## PHASE 4: FRONTEND - CUSTOMER BANNER DISPLAY (Priority: HIGH)

### Task 17: Banner Carousel Component ❌
**File**: `frontend/src/components/banners/BannerCarousel.tsx`
- [ ] Create carousel component
- [ ] Add auto-rotation
- [ ] Add navigation dots
- [ ] Add prev/next arrows
- [ ] Add click tracking
- [ ] Add impression tracking
**Estimated Time**: 4 hours

### Task 18: Hero Banner Component ❌
**File**: `frontend/src/components/banners/HeroBanner.tsx`
- [ ] Create large hero banner
- [ ] Add responsive design
- [ ] Add CTA button
- [ ] Add click tracking
**Estimated Time**: 2 hours

### Task 19: Sticky Banner Component ❌
**File**: `frontend/src/components/banners/StickyBanner.tsx`
- [ ] Create sticky top banner
- [ ] Add close button
- [ ] Add scroll behavior
- [ ] Save closed state
**Estimated Time**: 2 hours

### Task 20: Inline Banner Component ❌
**File**: `frontend/src/components/banners/InlineBanner.tsx`
- [ ] Create inline banner
- [ ] Add multiple layouts
- [ ] Add responsive design
**Estimated Time**: 2 hours

### Task 21: Integrate Banners in Pages ❌
**Files**: 
- `frontend/src/app/[tenant]/page.tsx` (Home)
- `frontend/src/app/[tenant]/services/page.tsx`
- `frontend/src/components/BookingModal.tsx` (Checkout)
- [ ] Add banner display to home page
- [ ] Add banner display to services page
- [ ] Add banner display at checkout
- [ ] Add banner display in dashboard
**Estimated Time**: 3 hours

### Task 22: Banner Hooks ❌
**File**: `frontend/src/hooks/useBanners.ts`
- [ ] Create `useActiveBanners()` hook
- [ ] Create `useTrackImpression()` hook
- [ ] Create `useTrackClick()` hook
**Estimated Time**: 1 hour

**PHASE 4 TOTAL**: 14 hours (2 days)

---

## PHASE 5: FRONTEND - LOYALTY COMPONENTS (Priority: HIGH)

### Task 23: Loyalty Points Widget ❌
**File**: `frontend/src/components/loyalty/LoyaltyPointsWidget.tsx`
- [ ] Create header widget
- [ ] Show points balance
- [ ] Add icon/badge
- [ ] Add click to dashboard link
- [ ] Add loading state
**Estimated Time**: 2 hours

### Task 24: Loyalty Dashboard ❌
**File**: `frontend/src/components/loyalty/LoyaltyDashboard.tsx`
- [ ] Create main dashboard
- [ ] Show points balance card
- [ ] Show tier information
- [ ] Show recent transactions
- [ ] Show available rewards
- [ ] Add enroll button (if not enrolled)
**Estimated Time**: 4 hours

### Task 25: Points History ❌
**File**: `frontend/src/components/loyalty/PointsHistory.tsx`
- [ ] Create transaction list
- [ ] Add pagination
- [ ] Add type filter (earned/redeemed)
- [ ] Show transaction details
- [ ] Add date formatting
**Estimated Time**: 3 hours

### Task 26: Tier Progress ❌
**File**: `frontend/src/components/loyalty/TierProgress.tsx`
- [ ] Create progress bar
- [ ] Show current tier
- [ ] Show next tier
- [ ] Show points needed
- [ ] Add tier benefits list
**Estimated Time**: 3 hours

### Task 27: Rewards Catalog ❌
**File**: `frontend/src/components/loyalty/RewardsCatalog.tsx`
- [ ] Create rewards grid
- [ ] Show reward cards
- [ ] Add redeem button
- [ ] Show points required
- [ ] Add "can redeem" indicator
**Estimated Time**: 3 hours

### Task 28: Redeem Points Modal ❌
**File**: `frontend/src/components/loyalty/RedeemPointsModal.tsx`
- [ ] Create redeem modal
- [ ] Add points input
- [ ] Add redemption type selector
- [ ] Add confirmation
- [ ] Show new balance
**Estimated Time**: 2 hours

### Task 29: Loyalty Page ❌
**File**: `frontend/src/app/[tenant]/loyalty/page.tsx`
- [ ] Create loyalty page
- [ ] Integrate all components
- [ ] Add responsive layout
**Estimated Time**: 2 hours

**PHASE 5 TOTAL**: 19 hours (2.5 days)

---

## PHASE 6: FRONTEND - REFERRAL COMPONENTS (Priority: HIGH)

### Task 30: Referral Widget ❌
**File**: `frontend/src/components/referral/ReferralWidget.tsx`
- [ ] Create share widget
- [ ] Show referral code
- [ ] Add copy button
- [ ] Add share buttons
**Estimated Time**: 2 hours

### Task 31: Referral Dashboard ❌
**File**: `frontend/src/components/referral/ReferralDashboard.tsx`
- [ ] Create main dashboard
- [ ] Show referral code prominently
- [ ] Show referral link
- [ ] Show statistics cards
- [ ] Show recent referrals
**Estimated Time**: 3 hours

### Task 32: Referral Stats ❌
**File**: `frontend/src/components/referral/ReferralStats.tsx`
- [ ] Create stats component
- [ ] Show total referrals
- [ ] Show conversions
- [ ] Show rewards earned
- [ ] Add charts
**Estimated Time**: 3 hours

### Task 33: Share Buttons ❌
**File**: `frontend/src/components/referral/ShareButtons.tsx`
- [ ] Create share buttons
- [ ] Add WhatsApp share
- [ ] Add Email share
- [ ] Add Facebook share
- [ ] Add Twitter share
- [ ] Add copy link button
- [ ] Track shares
**Estimated Time**: 3 hours

### Task 34: Referral Code Display ❌
**File**: `frontend/src/components/referral/ReferralCodeDisplay.tsx`
- [ ] Create code display
- [ ] Add copy functionality
- [ ] Add QR code
- [ ] Add expiry date
**Estimated Time**: 2 hours

### Task 35: Referral Page ❌
**File**: `frontend/src/app/[tenant]/referrals/page.tsx`
- [ ] Create referral page
- [ ] Integrate all components
- [ ] Add responsive layout
**Estimated Time**: 2 hours

**PHASE 6 TOTAL**: 15 hours (2 days)

---

## PHASE 7: FRONTEND - WALLET COMPONENTS (Priority: HIGH)

### Task 36: Wallet Widget ❌
**File**: `frontend/src/components/wallet/WalletWidget.tsx`
- [ ] Create header widget
- [ ] Show wallet balance
- [ ] Add wallet icon
- [ ] Add click to dashboard link
**Estimated Time**: 2 hours

### Task 37: Wallet Dashboard ❌
**File**: `frontend/src/components/wallet/WalletDashboard.tsx`
- [ ] Create main dashboard
- [ ] Show balance card
- [ ] Show recent transactions
- [ ] Add "Add Money" button
**Estimated Time**: 3 hours

### Task 38: Wallet Transactions ❌
**File**: `frontend/src/components/wallet/WalletTransactions.tsx`
- [ ] Create transaction list
- [ ] Add pagination
- [ ] Add type filter
- [ ] Show transaction details
- [ ] Add date formatting
**Estimated Time**: 3 hours

### Task 39: Add Money Modal ❌
**File**: `frontend/src/components/wallet/AddMoneyModal.tsx`
- [ ] Create add money modal
- [ ] Add amount input
- [ ] Add payment method selector
- [ ] Integrate payment gateway
- [ ] Show success message
**Estimated Time**: 4 hours

### Task 40: Wallet Page ❌
**File**: `frontend/src/app/[tenant]/wallet/page.tsx`
- [ ] Create wallet page
- [ ] Integrate all components
- [ ] Add responsive layout
**Estimated Time**: 2 hours

**PHASE 7 TOTAL**: 14 hours (2 days)

---

## PHASE 8: FRONTEND - CAMPAIGN/OFFERS COMPONENTS (Priority: MEDIUM)

### Task 41: Active Campaigns Banner ❌
**File**: `frontend/src/components/campaigns/ActiveCampaignsBanner.tsx`
- [ ] Create banner component
- [ ] Show active campaigns
- [ ] Add carousel for multiple
- [ ] Add click to details
**Estimated Time**: 3 hours

### Task 42: Campaign Card ❌
**File**: `frontend/src/components/campaigns/CampaignCard.tsx`
- [ ] Create campaign card
- [ ] Show campaign details
- [ ] Add claim button
- [ ] Show expiry date
**Estimated Time**: 2 hours

### Task 43: Campaign Details Modal ❌
**File**: `frontend/src/components/campaigns/CampaignDetailsModal.tsx`
- [ ] Create details modal
- [ ] Show full campaign info
- [ ] Show terms & conditions
- [ ] Add claim button
**Estimated Time**: 2 hours

### Task 44: Offers Page ❌
**File**: `frontend/src/app/[tenant]/offers/page.tsx`
- [ ] Create offers page
- [ ] List all active campaigns
- [ ] Add filters
- [ ] Add search
**Estimated Time**: 3 hours

**PHASE 8 TOTAL**: 10 hours (1.5 days)

---

## PHASE 9: CHECKOUT INTEGRATION (Priority: CRITICAL)

### Task 45: Automatic Discount Integration ❌
**File**: `frontend/src/components/BookingModal.tsx`
- [ ] Call discount API at checkout
- [ ] Display applicable discounts
- [ ] Show discount savings
- [ ] Auto-apply best discount
- [ ] Update total with discount
**Estimated Time**: 3 hours

### Task 46: Loyalty Points Integration ❌
**File**: `frontend/src/components/BookingModal.tsx`
- [ ] Show points to be earned
- [ ] Display current balance
- [ ] Add redeem points option
- [ ] Add points calculator
- [ ] Apply tier discounts
**Estimated Time**: 4 hours

### Task 47: Wallet Payment Integration ❌
**File**: `frontend/src/components/BookingModal.tsx`
- [ ] Show wallet balance
- [ ] Add "Use Wallet" checkbox
- [ ] Calculate partial payment
- [ ] Support wallet + other payment
- [ ] Update balance after payment
**Estimated Time**: 4 hours

### Task 48: Campaign Benefits Integration ❌
**File**: `frontend/src/components/BookingModal.tsx`
- [ ] Fetch applicable campaigns
- [ ] Auto-apply campaign benefits
- [ ] Show campaign savings
- [ ] Display campaign name
**Estimated Time**: 3 hours

**PHASE 9 TOTAL**: 14 hours (2 days)

---

## PHASE 10: ORDER FLOW INTEGRATION (Priority: HIGH)

### Task 49: Order Creation Updates ❌
**File**: `backend/src/controllers/customer/orderController.js`
- [ ] Award loyalty points on completion
- [ ] Process referral rewards
- [ ] Update campaign analytics
- [ ] Deduct wallet balance
- [ ] Track discount usage
- [ ] Record banner conversions
**Estimated Time**: 4 hours

### Task 50: Order History Enhancement ❌
**Files**:
- `frontend/src/app/[tenant]/orders/[id]/page.tsx`
- `frontend/src/app/[tenant]/orders/page.tsx`
- [ ] Show coupon used
- [ ] Display campaign applied
- [ ] Show loyalty points earned
- [ ] Display referral rewards
- [ ] Show savings breakdown
- [ ] Add promotional details section
**Estimated Time**: 4 hours

**PHASE 10 TOTAL**: 8 hours (1 day)

---

## PHASE 11: HEADER/SIDEBAR UPDATES (Priority: MEDIUM)

### Task 51: Customer Header Updates ❌
**File**: `frontend/src/components/layout/CustomerHeader.tsx`
- [ ] Add loyalty points widget
- [ ] Add wallet balance widget
- [ ] Add notifications for offers
**Estimated Time**: 2 hours

### Task 52: Customer Sidebar Updates ❌
**File**: `frontend/src/components/layout/CustomerSidebar.tsx`
- [ ] Add "Loyalty" menu item
- [ ] Add "Referrals" menu item
- [ ] Add "Wallet" menu item
- [ ] Add "Offers" menu item
- [ ] Add "Rewards" menu item
**Estimated Time**: 1 hour

**PHASE 11 TOTAL**: 3 hours (0.5 days)

---

## PHASE 12: REGISTRATION FLOW UPDATES (Priority: MEDIUM)

### Task 53: Referral Code Input ❌
**File**: `frontend/src/app/auth/register/page.tsx`
- [ ] Add referral code input field
- [ ] Add validation
- [ ] Show referee reward
- [ ] Auto-apply on registration
- [ ] Handle URL parameter (?ref=CODE)
**Estimated Time**: 3 hours

**PHASE 12 TOTAL**: 3 hours (0.5 days)

---

## PHASE 13: TESTING & BUG FIXES (Priority: CRITICAL)

### Task 54: Backend API Testing ❌
- [ ] Test all banner APIs (19 endpoints)
- [ ] Test all customer promotional APIs (19 endpoints)
- [ ] Test authentication
- [ ] Test multi-tenancy isolation
- [ ] Test error handling
- [ ] Test edge cases
**Estimated Time**: 8 hours

### Task 55: Frontend Component Testing ❌
- [ ] Test all loyalty components
- [ ] Test all referral components
- [ ] Test all wallet components
- [ ] Test all banner components
- [ ] Test all campaign components
- [ ] Test responsive design
**Estimated Time**: 8 hours

### Task 56: Integration Testing ❌
- [ ] Test complete order flow
- [ ] Test checkout with all features
- [ ] Test banner display and tracking
- [ ] Test promotional calculations
- [ ] Test multi-tenancy
**Estimated Time**: 6 hours

### Task 57: Bug Fixes & Polish ❌
- [ ] Fix identified bugs
- [ ] Improve UI/UX
- [ ] Add loading states
- [ ] Add error states
- [ ] Optimize performance
**Estimated Time**: 8 hours

**PHASE 13 TOTAL**: 30 hours (4 days)

---

## 📊 SUMMARY

### By Phase:
| Phase | Description | Tasks | Hours | Days | Status |
|-------|-------------|-------|-------|------|--------|
| 1 | Backend - Banners | 6 | 16 | 2 | ❌ |
| 2 | Admin Banner UI | 6 | 17 | 2 | ❌ |
| 3 | SuperAdmin Banner UI | 4 | 12 | 1.5 | ❌ |
| 4 | Customer Banner Display | 6 | 14 | 2 | ❌ |
| 5 | Loyalty Components | 7 | 19 | 2.5 | ❌ |
| 6 | Referral Components | 6 | 15 | 2 | ❌ |
| 7 | Wallet Components | 5 | 14 | 2 | ❌ |
| 8 | Campaign Components | 4 | 10 | 1.5 | ❌ |
| 9 | Checkout Integration | 4 | 14 | 2 | ❌ |
| 10 | Order Integration | 2 | 8 | 1 | ❌ |
| 11 | Header/Sidebar | 2 | 3 | 0.5 | ❌ |
| 12 | Registration | 1 | 3 | 0.5 | ❌ |
| 13 | Testing | 4 | 30 | 4 | ❌ |
| **TOTAL** | **All Phases** | **57** | **175** | **22** | **0%** |

### Already Completed:
- ✅ Backend Customer APIs (19 endpoints) - 2 days
- ✅ Frontend API Hooks (5 files) - 1 day
- **Completed**: 3 days

### Total Project Timeline:
- **Completed**: 3 days
- **Remaining**: 22 days
- **TOTAL**: 25 days (5 weeks)

---

## 🎯 RECOMMENDED EXECUTION ORDER

### Week 1: Banners Foundation
- Day 1-2: Backend banner system (Phase 1)
- Day 3-4: Admin banner UI (Phase 2)
- Day 5: Customer banner display (Phase 4 - partial)

### Week 2: Banners Complete + Loyalty Start
- Day 1: Customer banner display (Phase 4 - complete)
- Day 2: SuperAdmin banner UI (Phase 3)
- Day 3-5: Loyalty components (Phase 5)

### Week 3: Referral + Wallet
- Day 1-2: Referral components (Phase 6)
- Day 3-4: Wallet components (Phase 7)
- Day 5: Campaign components (Phase 8)

### Week 4: Integration
- Day 1-2: Checkout integration (Phase 9)
- Day 3: Order integration (Phase 10)
- Day 4: Header/Sidebar updates (Phase 11)
- Day 5: Registration updates (Phase 12)

### Week 5: Testing & Launch
- Day 1-2: Backend testing (Phase 13)
- Day 3: Frontend testing (Phase 13)
- Day 4: Integration testing (Phase 13)
- Day 5: Bug fixes & polish (Phase 13)

---

## 📝 NOTES

- Each task has estimated time
- Tasks are ordered by dependency
- Can parallelize some tasks if multiple developers
- Testing is continuous, not just at end
- Buffer time included for unexpected issues

---

**Created**: January 7, 2026  
**Total Tasks**: 57  
**Total Time**: 175 hours (22 days)  
**Status**: Ready to Execute 🚀
