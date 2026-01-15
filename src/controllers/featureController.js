const FeatureDefinition = require('../models/FeatureDefinition');

/**
 * Feature Definition Controller
 * Manages dynamic feature definitions for billing plans
 */
const featureController = {
  
  // ============ PUBLIC ENDPOINTS ============
  
  /**
   * Get all active features (public)
   * GET /api/public/features
   */
  getPublicFeatures: async (req, res) => {
    try {
      const features = await FeatureDefinition.find({ isActive: true })
        .select('key name description category valueType defaultValue icon sortOrder')
        .sort({ category: 1, sortOrder: 1 });
      
      res.json({
        success: true,
        data: { features }
      });
    } catch (error) {
      console.error('Get public features error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch features' });
    }
  },
  
  /**
   * Get features grouped by category (public)
   * GET /api/public/features/grouped
   */
  getPublicFeaturesGrouped: async (req, res) => {
    try {
      const grouped = await FeatureDefinition.getActiveGrouped();
      
      res.json({
        success: true,
        data: { features: grouped }
      });
    } catch (error) {
      console.error('Get grouped features error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch features' });
    }
  },
  
  // ============ SUPERADMIN ENDPOINTS ============
  
  /**
   * Get all features (including inactive)
   * GET /api/superadmin/features
   */
  getAllFeatures: async (req, res) => {
    try {
      const { includeInactive } = req.query;
      const query = includeInactive === 'true' ? {} : { isActive: true };
      
      const features = await FeatureDefinition.find(query)
        .sort({ category: 1, sortOrder: 1 });
      
      // Group by category for easier UI rendering
      const grouped = {
        core_laundry: [],
        platform: [],
        limits: [],
        branding: [],
        support: []
      };
      
      features.forEach(f => {
        if (grouped[f.category]) {
          grouped[f.category].push(f);
        }
      });
      
      res.json({
        success: true,
        data: { 
          features,
          grouped,
          categories: [
            { key: 'core_laundry', name: 'Core Laundry Features' },
            { key: 'platform', name: 'Platform Features' },
            { key: 'limits', name: 'Usage Limits' },
            { key: 'branding', name: 'Branding & Customization' },
            { key: 'support', name: 'Support' }
          ]
        }
      });
    } catch (error) {
      console.error('Get all features error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch features' });
    }
  },
  
  /**
   * Create a new feature definition
   * POST /api/superadmin/features
   */
  createFeature: async (req, res) => {
    try {
      const { key, name, description, category, valueType, defaultValue, constraints, icon } = req.body;
      
      // Validate required fields
      if (!key || !name || !category) {
        return res.status(400).json({
          success: false,
          message: 'Key, name, and category are required'
        });
      }
      
      // Check if key already exists
      const existing = await FeatureDefinition.findOne({ key: key.toLowerCase() });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'A feature with this key already exists'
        });
      }
      
      // Get max sort order for category
      const maxSort = await FeatureDefinition.findOne({ category })
        .sort({ sortOrder: -1 })
        .select('sortOrder');
      
      const feature = await FeatureDefinition.create({
        key: key.toLowerCase(),
        name,
        description,
        category,
        valueType: valueType || 'boolean',
        defaultValue: defaultValue ?? (valueType === 'number' ? 0 : false),
        constraints,
        icon,
        sortOrder: (maxSort?.sortOrder || 0) + 1,
        isSystem: false,
        isActive: true,
        createdBy: req.admin?._id || req.admin?.id
      });
      
      res.status(201).json({
        success: true,
        message: 'Feature created successfully',
        data: { feature }
      });
    } catch (error) {
      console.error('Create feature error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: 'Feature key already exists' });
      }
      res.status(500).json({ success: false, message: 'Failed to create feature' });
    }
  },
  
  /**
   * Update a feature definition
   * PUT /api/superadmin/features/:id
   */
  updateFeature: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, category, valueType, defaultValue, constraints, icon, isActive } = req.body;
      
      const feature = await FeatureDefinition.findById(id);
      if (!feature) {
        return res.status(404).json({ success: false, message: 'Feature not found' });
      }
      
      // Update allowed fields
      if (name) feature.name = name;
      if (description !== undefined) feature.description = description;
      if (category) feature.category = category;
      if (valueType) feature.valueType = valueType;
      if (defaultValue !== undefined) feature.defaultValue = defaultValue;
      if (constraints) feature.constraints = constraints;
      if (icon !== undefined) feature.icon = icon;
      if (typeof isActive === 'boolean') feature.isActive = isActive;
      
      await feature.save();
      
      res.json({
        success: true,
        message: 'Feature updated successfully',
        data: { feature }
      });
    } catch (error) {
      console.error('Update feature error:', error);
      res.status(500).json({ success: false, message: 'Failed to update feature' });
    }
  },
  
  /**
   * Delete a feature definition
   * DELETE /api/superadmin/features/:id
   */
  deleteFeature: async (req, res) => {
    try {
      const { id } = req.params;
      
      const feature = await FeatureDefinition.findById(id);
      if (!feature) {
        return res.status(404).json({ success: false, message: 'Feature not found' });
      }
      
      // Don't allow deleting system features
      if (feature.isSystem) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete system features. You can disable them instead.'
        });
      }
      
      await FeatureDefinition.deleteOne({ _id: id });
      
      res.json({
        success: true,
        message: 'Feature deleted successfully'
      });
    } catch (error) {
      console.error('Delete feature error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete feature' });
    }
  },
  
  /**
   * Reorder features within a category
   * POST /api/superadmin/features/reorder
   */
  reorderFeatures: async (req, res) => {
    try {
      const { orderedIds } = req.body;
      
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'orderedIds array is required'
        });
      }
      
      // Update sort order for each feature
      const updates = orderedIds.map((id, index) => 
        FeatureDefinition.updateOne({ _id: id }, { $set: { sortOrder: index } })
      );
      
      await Promise.all(updates);
      
      res.json({
        success: true,
        message: 'Features reordered successfully'
      });
    } catch (error) {
      console.error('Reorder features error:', error);
      res.status(500).json({ success: false, message: 'Failed to reorder features' });
    }
  },
  
  /**
   * Toggle feature active status
   * PATCH /api/superadmin/features/:id/toggle
   */
  toggleFeature: async (req, res) => {
    try {
      const { id } = req.params;
      
      const feature = await FeatureDefinition.findById(id);
      if (!feature) {
        return res.status(404).json({ success: false, message: 'Feature not found' });
      }
      
      feature.isActive = !feature.isActive;
      await feature.save();
      
      res.json({
        success: true,
        message: `Feature ${feature.isActive ? 'enabled' : 'disabled'} successfully`,
        data: { feature }
      });
    } catch (error) {
      console.error('Toggle feature error:', error);
      res.status(500).json({ success: false, message: 'Failed to toggle feature' });
    }
  },
  
  /**
   * Get default features map (for creating new plans)
   * GET /api/superadmin/features/defaults
   */
  getDefaultsMap: async (req, res) => {
    try {
      const defaults = await FeatureDefinition.getDefaultFeaturesMap();
      
      res.json({
        success: true,
        data: { defaults }
      });
    } catch (error) {
      console.error('Get defaults error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch defaults' });
    }
  }
};

module.exports = featureController;
