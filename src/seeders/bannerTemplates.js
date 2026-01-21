const BannerTemplate = require('../models/BannerTemplate');
const mongoose = require('mongoose');

const defaultTemplates = [
  // 1. HERO Banner Template
  {
    name: 'Hero Banner',
    code: 'HERO',
    description: 'Large prominent banner for main promotions',
    type: 'HERO',
    layout: {
      image: {
        width: 1920,
        height: 600,
        aspectRatio: '16:5',
        required: true,
        maxSizeKB: 800
      },
      fields: [
        {
          name: 'title',
          type: 'TEXT',
          maxLength: 60,
          required: true,
          placeholder: 'Enter main headline'
        },
        {
          name: 'subtitle',
          type: 'TEXT',
          maxLength: 120,
          required: false,
          placeholder: 'Enter supporting text'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 20,
        defaultText: 'Shop Now',
        secondary: {
          enabled: false
        }
      }
    },
    allowedPositions: [
      'HOME_HERO_TOP',
      'SERVICES_HERO_TOP',
      'OFFERS_HERO_TOP',
      'DASHBOARD_HERO_TOP',
      'LOGIN_HERO_SIDE'
    ],
    design: {
      maxTitleLength: 60,
      maxSubtitleLength: 120,
      maxDescriptionLength: 200,
      allowCustomColors: false,
      defaultColors: {
        background: '#ffffff',
        text: '#000000',
        cta: '#14b8a6'
      },
      animation: 'FADE'
    },
    settings: {
      autoRotate: false,
      rotateInterval: 5000,
      maxBanners: 1
    },
    responsive: {
      desktop: { show: true, fullWidth: true, columns: 1 },
      tablet: { show: true, fullWidth: true, columns: 1 },
      mobile: { show: true, fullWidth: true, columns: 1 }
    },
    status: 'ACTIVE'
  },

  // 2. SLIDER Banner Template
  {
    name: 'Slider Banner',
    code: 'SLIDER',
    description: 'Multiple rotating banners in carousel',
    type: 'SLIDER',
    layout: {
      image: {
        width: 1200,
        height: 400,
        aspectRatio: '3:1',
        required: true,
        maxSizeKB: 500
      },
      fields: [
        {
          name: 'title',
          type: 'TEXT',
          maxLength: 50,
          required: true,
          placeholder: 'Enter banner title'
        },
        {
          name: 'description',
          type: 'TEXTAREA',
          maxLength: 150,
          required: false,
          placeholder: 'Enter description'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 15,
        defaultText: 'View Offer',
        secondary: {
          enabled: false
        }
      }
    },
    allowedPositions: [
      'HOME_SLIDER_MID',
      'SERVICES_SLIDER_MID',
      'OFFERS_SLIDER_MID'
    ],
    design: {
      maxTitleLength: 50,
      maxSubtitleLength: 100,
      maxDescriptionLength: 150,
      allowCustomColors: false,
      defaultColors: {
        background: '#ffffff',
        text: '#000000',
        cta: '#14b8a6'
      },
      animation: 'SLIDE'
    },
    settings: {
      autoRotate: true,
      rotateInterval: 5000,
      maxBanners: 5
    },
    responsive: {
      desktop: { show: true, fullWidth: false, columns: 1 },
      tablet: { show: true, fullWidth: false, columns: 1 },
      mobile: { show: true, fullWidth: true, columns: 1 }
    },
    status: 'ACTIVE'
  },

  // 3. STRIP Banner Template
  {
    name: 'Announcement Strip',
    code: 'STRIP',
    description: 'Thin announcement bar for urgent messages',
    type: 'STRIP',
    layout: {
      image: {
        width: 0,
        height: 0,
        aspectRatio: '1:1',
        required: false,
        maxSizeKB: 0
      },
      fields: [
        {
          name: 'message',
          type: 'TEXT',
          maxLength: 100,
          required: true,
          placeholder: 'Enter announcement message'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 15,
        defaultText: 'Learn More',
        secondary: {
          enabled: false
        }
      }
    },
    allowedPositions: [
      'HOME_STRIP_TOP',
      'HOME_STRIP_BOTTOM',
      'CHECKOUT_STRIP_TOP',
      'LOGIN_STRIP_TOP',
      'GLOBAL_STRIP_TOP'
    ],
    design: {
      maxTitleLength: 100,
      maxSubtitleLength: 0,
      maxDescriptionLength: 0,
      allowCustomColors: true,
      defaultColors: {
        background: '#14b8a6',
        text: '#ffffff',
        cta: '#ffffff'
      },
      animation: 'NONE'
    },
    settings: {
      dismissible: true,
      sticky: true,
      height: 60
    },
    responsive: {
      desktop: { show: true, fullWidth: true, columns: 1 },
      tablet: { show: true, fullWidth: true, columns: 1 },
      mobile: { show: true, fullWidth: true, columns: 1 }
    },
    status: 'ACTIVE'
  },

  // 4. CARD Banner Template
  {
    name: 'Card Banner',
    code: 'CARD',
    description: 'Small rectangular card for secondary promotions',
    type: 'CARD',
    layout: {
      image: {
        width: 400,
        height: 300,
        aspectRatio: '4:3',
        required: true,
        maxSizeKB: 200
      },
      fields: [
        {
          name: 'title',
          type: 'TEXT',
          maxLength: 40,
          required: true,
          placeholder: 'Enter card title'
        },
        {
          name: 'description',
          type: 'TEXTAREA',
          maxLength: 80,
          required: false,
          placeholder: 'Enter brief description'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 12,
        defaultText: 'View',
        secondary: {
          enabled: false
        }
      }
    },
    allowedPositions: [
      'HOME_CARD_SIDEBAR',
      'SERVICES_CARD_GRID',
      'OFFERS_CARD_GRID',
      'CHECKOUT_CARD_SIDEBAR',
      'DASHBOARD_CARD_GRID'
    ],
    design: {
      maxTitleLength: 40,
      maxSubtitleLength: 60,
      maxDescriptionLength: 80,
      allowCustomColors: false,
      defaultColors: {
        background: '#ffffff',
        text: '#000000',
        cta: '#14b8a6'
      },
      animation: 'ZOOM'
    },
    settings: {
      compact: true
    },
    responsive: {
      desktop: { show: true, fullWidth: false, columns: 3 },
      tablet: { show: true, fullWidth: false, columns: 2 },
      mobile: { show: true, fullWidth: true, columns: 1 }
    },
    status: 'ACTIVE'
  },

  // 5. MODAL Banner Template
  {
    name: 'Modal Popup',
    code: 'MODAL',
    description: 'Popup overlay banner for important announcements',
    type: 'MODAL',
    layout: {
      image: {
        width: 600,
        height: 300,
        aspectRatio: '2:1',
        required: false,
        maxSizeKB: 400
      },
      fields: [
        {
          name: 'title',
          type: 'TEXT',
          maxLength: 50,
          required: true,
          placeholder: 'Enter popup title'
        },
        {
          name: 'description',
          type: 'TEXTAREA',
          maxLength: 200,
          required: false,
          placeholder: 'Enter detailed message'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 20,
        defaultText: 'Get Started',
        secondary: {
          enabled: true,
          maxLength: 20
        }
      }
    },
    allowedPositions: [
      'GLOBAL_MODAL_CENTER'
    ],
    design: {
      maxTitleLength: 50,
      maxSubtitleLength: 100,
      maxDescriptionLength: 200,
      allowCustomColors: false,
      defaultColors: {
        background: '#ffffff',
        text: '#000000',
        cta: '#14b8a6'
      },
      animation: 'FADE'
    },
    settings: {
      overlay: true,
      dismissible: true,
      triggers: ['ON_LOAD', 'EXIT_INTENT', 'TIMED'],
      modalSize: {
        width: 500,
        height: 600
      }
    },
    responsive: {
      desktop: { show: true, fullWidth: false, columns: 1 },
      tablet: { show: true, fullWidth: false, columns: 1 },
      mobile: { show: true, fullWidth: true, columns: 1 }
    },
    status: 'ACTIVE'
  },

  // 6. FLOATING Banner Template
  {
    name: 'Floating Corner Banner',
    code: 'FLOATING',
    description: 'Persistent corner banner for ongoing promotions',
    type: 'FLOATING',
    layout: {
      image: {
        width: 250,
        height: 100,
        aspectRatio: '5:2',
        required: false,
        maxSizeKB: 150
      },
      fields: [
        {
          name: 'title',
          type: 'TEXT',
          maxLength: 30,
          required: true,
          placeholder: 'Enter short message'
        }
      ],
      cta: {
        enabled: true,
        maxLength: 10,
        defaultText: 'View',
        secondary: {
          enabled: false
        }
      }
    },
    allowedPositions: [
      'GLOBAL_FLOATING_CORNER'
    ],
    design: {
      maxTitleLength: 30,
      maxSubtitleLength: 0,
      maxDescriptionLength: 0,
      allowCustomColors: false,
      defaultColors: {
        background: '#14b8a6',
        text: '#ffffff',
        cta: '#ffffff'
      },
      animation: 'SLIDE'
    },
    settings: {
      dismissible: true,
      position: 'BOTTOM_RIGHT',
      floatingSize: {
        width: 250,
        height: 150
      }
    },
    responsive: {
      desktop: { show: true, fullWidth: false, columns: 1 },
      tablet: { show: false, fullWidth: false, columns: 1 },
      mobile: { show: false, fullWidth: false, columns: 1 }
    },
    status: 'ACTIVE'
  }
];

async function seedBannerTemplates(superAdminId) {
  try {
    console.log('🌱 Seeding banner templates...');
    
    // Check if templates already exist
    const existingCount = await BannerTemplate.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  ${existingCount} templates already exist. Skipping seed.`);
      return;
    }
    
    // Add createdBy to each template
    const templatesWithCreator = defaultTemplates.map(template => ({
      ...template,
      createdBy: superAdminId || new mongoose.Types.ObjectId()
    }));
    
    // Insert templates
    const result = await BannerTemplate.insertMany(templatesWithCreator);
    
    console.log(`✅ Successfully seeded ${result.length} banner templates:`);
    result.forEach(template => {
      console.log(`   - ${template.name} (${template.code})`);
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error seeding banner templates:', error);
    throw error;
  }
}

// Run seed if called directly
if (require.main === module) {
  require('dotenv').config();
  
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management')
    .then(async () => {
      console.log('📦 Connected to MongoDB');
      await seedBannerTemplates();
      console.log('✅ Seeding complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    });
}

module.exports = { seedBannerTemplates, defaultTemplates };
