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
    console.log("seeding users");
    for (const user of users) {
      if (user) {
        await prisma.user.create({
          data: user,
        });
      }
    }

    console.log("seeding categories");
    for (const category of categories) {
      if (category) {
        await prisma.category.create({
          data: category,
        });
      }
    }
    console.log("seeding products");
    for (const product of products) {
      if (product) {
        await prisma.product.create({
          data: product,
        });
      }
    }
    console.log("seeding recipe");
    for (const recipe of recipes) {
      await prisma.recipe.create({
        data: recipe,
      });
    }

    console.log("seeding meal");
    for (const meal of meals) {
      await prisma.meal.create({
        data: meal,
      });
    }

    console.log("seeding productRecipe");
    for (const productRecipe of productRecipes) {
      await prisma.productRecipe.create({
        data: productRecipe,
      });
    }

    console.log("seeding recipeMeal");
    for (const recipeMeal of recipeMeals) {
      await prisma.recipeMeal.create({
        data: recipeMeal,
      });
    }

    console.log("Seeding completed successfully.");
  } catch (error) {
    console.error("Error during seeding:", error);
  }
};

seed();
