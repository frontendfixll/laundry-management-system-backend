const express = require('express');
const {
  getKnowledgeBase,
  getKnowledgeBaseArticle,
  createKnowledgeBaseArticle,
  updateKnowledgeBaseArticle,
  deleteKnowledgeBaseArticle,
  markArticleHelpful,
  getKnowledgeBaseCategories,
  createKnowledgeBaseCategory,
  updateKnowledgeBaseCategory,
  deleteKnowledgeBaseCategory
} = require('../../controllers/support/knowledgeBaseController');
const { validate, knowledgeBaseValidation } = require('../../utils/validators');

const router = express.Router();

// Knowledge Base Articles
router.get('/', getKnowledgeBase);
router.get('/:articleId', getKnowledgeBaseArticle);
router.post('/', validate(knowledgeBaseValidation.createArticle), createKnowledgeBaseArticle);
router.put('/:articleId', validate(knowledgeBaseValidation.updateArticle), updateKnowledgeBaseArticle);
router.delete('/:articleId', deleteKnowledgeBaseArticle);
router.post('/:articleId/helpful', validate(knowledgeBaseValidation.markHelpful), markArticleHelpful);

// Knowledge Base Categories
router.get('/categories/list', getKnowledgeBaseCategories);
router.post('/categories', validate(knowledgeBaseValidation.createCategory), createKnowledgeBaseCategory);
router.put('/categories/:categoryId', validate(knowledgeBaseValidation.updateCategory), updateKnowledgeBaseCategory);
router.delete('/categories/:categoryId', deleteKnowledgeBaseCategory);

module.exports = router;