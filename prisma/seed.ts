import { PrismaClient } from "@prisma/client";
import users from "./data/users.json";
import products from "./data/products.json";
import categories from "./data/categories.json";
import meals from "./data/meals.json";
import productMeals from "./data/product_meals.json";
import data from "./data/userFormData.json";

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
