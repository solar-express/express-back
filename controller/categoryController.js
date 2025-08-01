const Category = require("../models/CategoryModel");
const Product = require("../models/ProductsModel");
const Brand = require("../models/BrandModel");
const asyncHandler = require("express-async-handler");

// @desc    Create a category
// @route   POST /api/categories
const createCategory = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    parentCategory,
    level,
    icon,
    isActive,
    isFeatured,
  } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("Please provide a category name");
  }

  const categoryExists = await Category.findOne({ name });
  if (categoryExists) {
    res.status(400);
    throw new Error("Category already exists");
  }

  const category = new Category({
    name,
    description: description || "",
    image: req.body.image || null,
    icon: icon || null,
    parentCategory: parentCategory || null,
    level: level || 1,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : false,
    sortOrder: req.body.sortOrder || 0,
  });

  await category.save(); // triggers pre-save hook

  res.status(201).json(category);
});

// @desc    Update a category
// @route   PUT /api/categories/:id
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  category.name = req.body.name || category.name;
  category.description = req.body.description || category.description;
  category.image = req.body.image || category.image;
  category.icon = req.body.icon || category.icon;
  category.parentCategory = req.body.parentCategory || category.parentCategory;
  category.level =
    req.body.level !== undefined ? Number(req.body.level) : category.level;
  category.isActive =
    req.body.isActive !== undefined
      ? Boolean(req.body.isActive)
      : category.isActive;
  category.isFeatured =
    req.body.isFeatured !== undefined
      ? Boolean(req.body.isFeatured)
      : category.isFeatured;
  category.sortOrder =
    req.body.sortOrder !== undefined
      ? Number(req.body.sortOrder)
      : category.sortOrder;

  if (req.body.featuredProducts) {
    category.featuredProducts = req.body.featuredProducts;
  }

  if (req.body.popularBrands) {
    category.popularBrands = req.body.popularBrands;
  }

  const updatedCategory = await category.save();
  res.json(updatedCategory);
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  // Fixed: Changed from remove() to deleteOne() which is the modern approach
  await category.deleteOne();
  res.json({ message: "Category removed" });
});

// @desc    Get category by slug
// @route   GET /api/categories/:slug
const getCategoryBySlug = asyncHandler(async (req, res) => {
  const category = await Category.findOne({
    slug: req.params.slug,
    isActive: true,
  })
    .populate({
      path: "featuredProducts",
      select: "name slug price originalPrice discountPercentage images",
      match: { isActive: true },
    })
    .populate({
      path: "popularBrands",
      select: "name slug logo",
      match: { isActive: true },
    });

  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  res.json(category);
});

// @desc    Get all main categories
// @route   GET /api/categories
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({
    isActive: true,
    level: 1,
  })
    .select("name slug image icon productCount isFeatured")
    .sort({ name: 1 });

  res.json(categories);
});

// @desc    Get featured categories
// @route   GET /api/categories/featured
const getFeaturedCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({
    isFeatured: true,
    isActive: true,
    level: 1,
  })
    .select("name slug image icon")
    .limit(6)
    .sort({ name: 1 });

  res.json(categories);
});

// @desc    Get category products
// @route   GET /api/categories/:slug/products
const getCategoryProducts = asyncHandler(async (req, res) => {
  const { slug } = req.params;

  console.log("Fetching category products for slug:", slug);

  // 1. Find category by slug
  const category = await Category.findOne({ slug, isActive: true });
  if (!category) {
    console.error("Category not found for slug:", slug);
    return res
      .status(404)
      .json({ success: false, message: "Category not found" });
  }

  console.log("Category found:", category);

  // 2. Build query - Fixed: Added a check for isActive field existence
  const query = {
    category: category._id,
    ...(typeof Product.schema.paths.isActive !== "undefined"
      ? { isActive: true }
      : {}),
  };

  console.log("Query for products:", query);

  // 3. Fetch all products without pagination
  const products = await Product.find(query)
    .select("name slug price originalPrice discountPercentage images")
    .sort("-createdAt");

  console.log("Products fetched:", products);

  // 4. Return response
  res.status(200).json({
    success: true,
    products,
    category: {
      name: category.name,
      slug: category.slug,
      image: category.image,
    },
    total: products.length,
  });
});

// @desc    Get all categories for admin
// @route   GET /api/categories/admin/all
const getAllCategoriesAdmin = asyncHandler(async (req, res) => {
  const categories = await Category.find({})
    .populate("parentCategory", "name")
    .select(
      "name slug description icon level parentCategory isActive isFeatured productCount sortOrder createdAt updatedAt"
    )
    .sort({ level: 1, sortOrder: 1, name: 1 });

  // Update product counts for all categories
  for (const category of categories) {
    await Category.updateProductCount(category._id);
  }

  // Fetch updated categories with correct product counts
  const updatedCategories = await Category.find({})
    .populate("parentCategory", "name")
    .select(
      "name slug description icon level parentCategory isActive isFeatured productCount sortOrder createdAt updatedAt"
    )
    .sort({ level: 1, sortOrder: 1, name: 1 });

  res.json(updatedCategories);
});

// @desc    Get categories with brands for navigation
// @route   GET /api/categories/navigation
const getCategoriesWithBrands = asyncHandler(async (req, res) => {
  try {
    // Get all active categories
    const categories = await Category.find({
      isActive: true,
      level: 1,
    })
      .select("name slug icon")
      .sort({ name: 1 });

    // For each category, find brands that have products in that category
    const categoriesWithBrands = await Promise.all(
      categories.map(async (category) => {
        const brands = await Brand.find({
          isActive: true,
          productCategories: category._id,
        })
          .select("name slug logo")
          .sort({ name: 1 });

        // For each brand, get subcategories (product types) they have in this category
        const brandsWithSubcategories = await Promise.all(
          brands.map(async (brand) => {
            // Get products from this brand in this category to determine subcategories
            const products = await Product.find({
              brand: brand._id,
              category: category._id,
              ...(typeof Product.schema.paths.isActive !== "undefined"
                ? { isActive: true }
                : {}),
            })
              .select("name")
              .limit(8); // Limit subcategories for display

            const subcategories = products.map((product) => product.name);

            return {
              name: brand.name,
              slug: brand.slug,
              logo: brand.logo,
              subcategories: subcategories,
              url: `/brand/${brand.slug}`,
            };
          })
        );

        return {
          name: category.name,
          slug: category.slug,
          icon: category.icon,
          route: `/store?category=${category.slug}`,
          brands: brandsWithSubcategories,
        };
      })
    );

    res.json(categoriesWithBrands);
  } catch (error) {
    console.error("Error fetching categories with brands:", error);
    res.status(500).json({ message: "Error fetching navigation data" });
  }
});

// @desc    Get brands for a specific category by slug
// @route   GET /api/categories/brands/:slug
const getBrandsForCategory = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  try {
    const category = await Category.findOne({ slug });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const brands = await Brand.find({ categories: category._id }).select(
      "name slug logo banner thumbnail description isFeatured"
    );

    res.json({ category: category.name, brands });
  } catch (error) {
    console.error("Error fetching brands for category:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryBySlug,
  getCategories,
  getFeaturedCategories,
  getCategoryProducts,
  getAllCategoriesAdmin,
  getCategoriesWithBrands,
  getBrandsForCategory,
};
