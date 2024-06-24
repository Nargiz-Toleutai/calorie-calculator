import { PrismaClient } from "@prisma/client";
import users from "./data/users.json";
import products from "./data/products.json";
import categories from "./data/categories.json";
import meals from "./data/meals.json";
import productMeals from "./data/product_meals.json";
const prisma = new PrismaClient();

const seed = async () => {
  try {
    console.log("seeding users");
    for (const userData of users) {
      if (userData) {
        await prisma.user.create({
          data: userData,
        });
      }
    }
    console.log("seeding categories");
    for (const categoryData of categories) {
      if (categoryData) {
        await prisma.category.create({
          data: categoryData,
        });
      }
    }
    console.log("seeding products");
    for (const productData of products) {
      if (productData) {
        await prisma.product.create({
          data: productData,
        });
      }
    }
    console.log("seeding meals");
    for (const meal of meals) {
      await prisma.meal.create({
        data: meal,
      });
    }

    console.log("seeding productMeals");
    for (const productMeal of productMeals) {
      await prisma.productMeal.create({
        data: productMeal,
      });
    }

    console.log("Seeding completed successfully.");
  } catch (error) {
    console.error("Error during seeding:", error);
  }
};

seed();
