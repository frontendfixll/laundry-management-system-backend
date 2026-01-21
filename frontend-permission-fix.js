
/**
 * Frontend Permission Sync Fix
 * 
 * Run this in Admin Dashboard console: http://localhost:3005/admin/dashboard
 * Login as: shkrkand@gmail.com / admin123
 */

console.log('🔧 Frontend Permission Sync Fix');
console.log('===============================');

async function fixFrontendPermissions() {
    try {
        // Step 1: Test profile API
        console.log('\n👤 Step 1: Testing profile API...');
        
        const profileResponse = await fetch('/api/auth/profile', {
            credentials: 'include'
        });
        
        if (!profileResponse.ok) {
            console.error('❌ Profile API failed:', profileResponse.status);
            return false;
        }
        
        const profileData = await profileResponse.json();
        
        if (!profileData.success || !profileData.data) {
            console.error('❌ Profile API returned invalid data');
            return false;
        }
        
        const userData = profileData.data;
        const permissions = userData.permissions || {};
        const features = userData.features || {};
        
        console.log('✅ Profile API working:', {
            permissionModules: Object.keys(permissions).length,
            featureCount: Object.keys(features).length
        });
        
        // Step 2: Update auth store
        console.log('\n🔄 Step 2: Updating auth store...');
        
        if (window.__updateAuthStore) {
            window.__updateAuthStore({
                permissions: permissions,
                features: features,
                tenancy: userData.tenancy,
                name: userData.name,
                phone: userData.phone,
                isEmailVerified: userData.isEmailVerified,
                phoneVerified: userData.phoneVerified
            });
            
            console.log('✅ Auth store updated');
            
            // Step 3: Verify update
            setTimeout(() => {
                console.log('\n🔍 Step 3: Verifying update...');
                
                const authData = localStorage.getItem('laundry-auth');
                if (authData) {
                    const parsed = JSON.parse(authData);
                    const user = parsed.state?.user || parsed.user;
                    
                    const newPermissions = user?.permissions || {};
                    const newFeatures = user?.features || {};
                    
                    console.log('📊 Updated state:', {
                        permissionModules: Object.keys(newPermissions).length,
                        featureCount: Object.keys(newFeatures).length
                    });
                    
                    if (Object.keys(newPermissions).length > 0 && Object.keys(newFeatures).length > 0) {
                        console.log('\n🎉 SUCCESS!');
                        console.log('✅ Permissions and features are now loaded');
                        console.log('✅ Sidebar should now show all menu items');
                        console.log('✅ Real-time updates should work');
                        console.log('');
                        console.log('🔄 Please refresh the page to see all changes');
                        
                        return true;
                    } else {
                        console.error('❌ Update failed - still no permissions or features');
                        return false;
                    }
                } else {
                    console.error('❌ No auth data found after update');
                    return false;
                }
            }, 1000);
            
        } else {
            console.error('❌ Auth store update function not available');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error fixing frontend permissions:', error);
        return false;
    }
}

// Auto-run the fix
fixFrontendPermissions();

// Also expose for manual use
window.fixFrontendPermissions = fixFrontendPermissions;

console.log('\n📋 Available Functions:');
console.log('• fixFrontendPermissions() - Fix frontend permissions');
