import { PrismaClient } from "@prisma/client";
import users from "./data/users.json";
import products from "./data/products.json";
import categories from "./data/categories.json";
import recipes from "./data/recipes.json";
import meals from "./data/meals.json";
import productRecipes from "./data/product_recipes.json";
import recipeMeals from "./data/recipe_meals.json";

const prisma = new PrismaClient();

const seed = async () => {
  try {
    for (const user of users) {
      if (user) {
        await prisma.user.create({
          data: user,
        });
      }
    }

    for (const category of categories) {
      if (category) {
        await prisma.category.create({
          data: category,
        });
      }
    }

    for (const product of products) {
      if (product) {
        await prisma.product.create({
          data: product,
        });
      }
    }

    for (const recipe of recipes) {
      await prisma.recipe.create({
        data: recipe,
      });
    }

    for (const meal of meals) {
      await prisma.meal.create({
        data: meal,
      });
    }

    for (const productRecipe of productRecipes) {
      await prisma.productRecipe.create({
        data: productRecipe,
      });
    }

    for (const recipeMeal of recipeMeals) {
      await prisma.recipeMeal.create({
        data: recipeMeal,
      });
    }
  } catch (error) {
    console.error("Error during seeding:", error);
  }
};

seed();
