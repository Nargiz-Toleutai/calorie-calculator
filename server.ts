import express, { json } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import { toToken } from "./auth/jwt";
import { AuthMiddleware, AuthRequest } from "./auth/middelware";
import { z } from "zod";
import path from "path";
import nodemailer from "nodemailer";
import crypto from "crypto";
import * as fs from "fs";
import formidable, { errors as formidableErrors } from "formidable";

import dotenv from "dotenv";

import { calculatePortions, calulateCPCF } from "./utils/calculator";

dotenv.config();

const app = express();
app.use(cors());

app.get("/greeting", (req, res) => {
  const message = process.env.MESSAGE;
  res.send(message);
});

app.use(
  "/images",
  express.static(path.join(__dirname, "./prisma/data/images"))
);

app.use("/cdn", express.static(path.join(__dirname, "./uploads")));

const port = process.env.PORT || 3001;

const prisma = new PrismaClient();

app.use(json());

const EmailValidator = z
  .string()
  .toLowerCase()
  .min(5)
  .email({ message: "Invalid email address" });

const UserDataValidator = z
  .object({
    name: z.string().min(1, {
      message: "Name should have a minimum length of 1 character",
    }),
    email: EmailValidator,
    password: z.string().min(5, {
      message: "Password should have a minimum length of 5 characters",
    }),
  })
  .strict();

const AdditionalUserDataValidator = z
  .object({
    weight: z.number().min(40, {
      message: "Weight should be a minimum of 40kg",
    }),
    height: z.number().min(50, {
      message: "Height should be a minimum of 50cm",
    }),
    age: z.number().min(18, {
      message: "Age should be a minimum of 18",
    }),
    gender: z.enum(["male", "female"], {
      message: "Gender is required",
    }),
    activityLevel: z.number().min(1, {
      message: "Activity level should be a minimum of 1",
    }),
    targetDeficitPercent: z.number().min(0, {
      message: "Deficit percentage should be a minimum of 0",
    }),
    calorieTarget: z.number(),
  })
  .strict();

const RecipeValidator = z
  .object({
    name: z
      .string()
      .min(2, { message: "Name should be a minimum of 2 characters" }),
    categoryId: z.number().int(),
    products: z
      .array(
        z.object({
          productId: z.number().int(),
        })
      )
      .nonempty({ message: "At least one product must be selected" }),
  })
  .strict();

const MAX_FILE_SIZE = 1024 * 1024 * 5;
const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];
const ACCEPTED_IMAGE_TYPES = ["jpeg", "jpg", "png", "webp"];

const ProductValidator = z
  .object({
    id: z.number().int().optional(),
    name: z
      .string()
      .min(2, { message: "Name should be a minimum of 2 characters" }),
    unit: z.string().min(1, { message: "Unit should not be empty" }),
    quantity: z.preprocess(
      (val) => Number(val),
      z.number().nonnegative({ message: "Quantity should be non-negative" })
    ),
    protein: z.preprocess(
      (val) => Number(val),
      z.number().nonnegative({ message: "Protein should be non-negative" })
    ),
    carbs: z.preprocess(
      (val) => Number(val),
      z.number().nonnegative({ message: "Carbs should be non-negative" })
    ),
    fat: z.preprocess(
      (val) => Number(val),
      z.number().nonnegative({ message: "Fat should be non-negative" })
    ),
    calories: z.preprocess(
      (val) => Number(val),
      z.number().min(0, { message: "Calories should be non-negative" })
    ),
    portion: z.preprocess(() => 0, z.number().min(0).default(0)),
    image: z
      .any()
      .optional()
      .refine(
        (file) => !file || file.size <= MAX_FILE_SIZE,
        `Max image size is 5MB.`
      )
      .refine(
        (file) => !file || ACCEPTED_IMAGE_MIME_TYPES.includes(file.mimetype),
        "Only .jpg, .jpeg, .png and .webp formats are supported."
      ),
  })
  .strict();

app.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        weight: true,
        height: true,
        age: true,
        gender: true,
        activityLevel: true,
        targetDeficitPercent: true,
        recipes: true,
        meals: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get("/products", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  if (isNaN(req.userId)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get("/products/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  if (isNaN(req.userId)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }
  const id = Number(req.params.id);
  try {
    const product = await prisma.product.findUnique({
      where: { id: id },
    });

    if (product) {
      res.json(product);
    } else {
      res.status(404).send({ message: "Recipe not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

const formMultiToFormSingle = (form: {
  [key: string]: string[] | undefined;
}): { [key: string]: string | undefined } =>
  Object.fromEntries(
    Object.entries(form).map(([key, values]) => [key, values?.[0]])
  );

const processImagePath = (imagePath?: string): string => {
  if (!imagePath) return "";
  return imagePath.replace(path.join(__dirname, "uploads"), "/cdn");
};

app.post("/products", AuthMiddleware, async (req: AuthRequest, res) => {
  const formData = formidable({
    uploadDir: path.join(__dirname, "uploads"),
    keepExtensions: true,
  });
  let fields: formidable.Fields<string>, files: formidable.Files<string>;
  try {
    [fields, files] = await formData.parse(req);
  } catch (err) {
    console.error(err);
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(String(err));
    return;
  }

  const product = formMultiToFormSingle(fields);
  const { name, unit, quantity, protein, carbs, fat, calories, portion } =
    product;

  const image = files.image?.[0];

  if (!name || !unit || !quantity || !protein || !carbs || !fat || !calories) {
    return res.status(400).send({
      message:
        "name, unit, quantity, protein, carbs, fat, and calories are required",
    });
  }

  const validated = ProductValidator.safeParse({
    ...product,
    image: image ? image : undefined,
  });

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  const userExists = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!userExists) {
    return res.status(404).send({ message: "User not found" });
  }

  try {
    const newProduct = await prisma.product.create({
      data: {
        name,
        unit,
        quantity: parseInt(quantity as string),
        protein: parseInt(protein as string),
        carbs: parseInt(carbs as string),
        fat: parseInt(fat as string),
        calories: parseInt(calories as string),
        portion: portion ? parseFloat(portion as string) : 0,
        image: processImagePath(image?.filepath),
      },
    });

    res.status(201).send({
      message: "New product was added!",
      newProduct,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong", error: error });
  }
});

app.patch("/products/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  const formData = formidable({
    uploadDir: path.join(__dirname, "uploads"),
    keepExtensions: true,
  });

  let fields: formidable.Fields<string>, files: formidable.Files<string>;
  try {
    [fields, files] = await formData.parse(req);
  } catch (err) {
    console.error(err);
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(String(err));
    return;
  }

  const product = formMultiToFormSingle(fields);

  const image = files.image?.[0];

  const validated = ProductValidator.safeParse({
    ...product,
    image: image ? image : undefined,
  });

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  const userExists = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!userExists) {
    return res.status(404).send({ message: "User not found" });
  }

  try {
    const currentProduct = await prisma.product.findUnique({
      where: { id: id },
    });

    if (!currentProduct) {
      return res.status(404).send({ message: "Product not found" });
    }

    // if (currentProduct.userId !== req.userId) {
    //   return res
    //     .status(403)
    //     .send({ message: "You are not allowed to update this product" });
    // }

    await prisma.product.update({
      where: { id: id },
      data: {
        name: validated.data.name,
        unit: validated.data.unit,
        quantity: validated.data.quantity,
        protein: validated.data.protein,
        carbs: validated.data.carbs,
        fat: validated.data.fat,
        calories: validated.data.calories,
        image: image
          ? processImagePath(validated.data.image?.filepath)
          : currentProduct.image,
      },
    });

    const updatedProduct = await prisma.product.findUnique({
      where: { id: id },
    });

    res.send({ message: "Product was updated", updatedProduct });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.get("/user_info", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        meals: true,
      },
    });

    if (user) {
      res.json(user);
    } else {
      res.status(404).send({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.patch("/user", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  if (isNaN(req.userId)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  const validated = AdditionalUserDataValidator.safeParse(req.body);

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  try {
    const currentForm = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        meals: true,
      },
    });

    if (!currentForm) {
      return res.status(404).send({ message: "Form not found" });
    }

    const user = validated.data;

    const updatedForm = await prisma.user.update({
      where: { id: req.userId },
      data: user,
    });

    res.send({ message: "Form was updated", updatedForm });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.get("/categories", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  if (isNaN(req.userId)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }
  try {
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        icon: true,
      },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.post("/categories", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  const { name, icon } = req.body;

  if (name && icon !== undefined) {
    try {
      const newCategory = await prisma.category.create({
        data: {
          name,
          icon,
        },
      });
      res.status(201).send({
        message: "New category was added!",
        newCategory: newCategory,
      });
    } catch (error) {
      res.status(500).send({ message: "Something went wrong" });
    }
  } else {
    res.status(400).send({ message: "name and icon are required" });
  }
});

app.get("/recipes", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  if (isNaN(req.userId)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  try {
    const recipes = await prisma.recipe.findMany({
      where: {
        userId: req.userId,
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
        products: {
          select: {
            product: true,
          },
        },
        category: true,
      },
    });

    const cleanRecipes = recipes.map((recipe) => ({
      ...recipe,
      products: recipe.products.map((nestedProduct) => nestedProduct.product),
    }));

    res.json(cleanRecipes);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get(
  "/recipes/_with_portions",
  AuthMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const [user, recipes, categories] = await Promise.all([
        prisma.user.findUnique({
          where: { id: req.userId },
          include: {
            meals: true,
          },
        }),
        prisma.recipe.findMany({
          where: { userId: req.userId },
          select: {
            id: true,
            name: true,
            categoryId: true,

            products: {
              select: {
                product: true,
              },
            },
            category: true,
          },
        }),
        prisma.category.findMany({
          select: {
            id: true,
            name: true,
            icon: true,
          },
        }),
      ]);

      if (!user || !recipes || !categories)
        return void res.status(500).send({ message: "Something went wrong" });

      const cleanRecipes = recipes.map((recipe) => ({
        ...recipe,
        products: recipe.products.map((nestedProduct) => nestedProduct.product),
      }));

      const categoryNameToIdMap = categories.reduce<{ [id: number]: string }>(
        (categoriesMap, category) => {
          categoriesMap[category.id] = category.name;
          return categoriesMap;
        },
        {}
      );

      const recipesByCategory = cleanRecipes.reduce<{
        [category: string]: { recipes: typeof cleanRecipes };
      }>((group, recipe) => {
        const category = categoryNameToIdMap[recipe.categoryId].toLowerCase();
        if (!group[category]) group[category] = { recipes: [] };
        group[category].recipes.push(recipe);

        return group;
      }, {});

      const cpcf = calulateCPCF(
        user.gender as "male" | "female",
        user.weight as number,
        user.height as number,
        user.age as number,
        user.activityLevel as 1 | 2 | 3 | 4 | 5,
        user.targetDeficitPercent as number
      );

      res.json(
        calculatePortions({
          recipesByCategory,
          total: cpcf,
        })
      );
    } catch (error) {
      res.status(500).send({ message: "Something went wrong" });
    }
  }
);

app.patch("/recipes/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  const validated = RecipeValidator.safeParse(req.body);

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  try {
    const currentForm = await prisma.recipe.findUnique({
      where: { id: id, userId: req.userId },
      include: {
        products: true,
      },
    });

    if (!currentForm) {
      return res.status(404).send({ message: "Form not found" });
    }

    await prisma.recipe.update({
      where: { id: id, userId: req.userId },
      data: {
        name: validated.data.name,
        categoryId: validated.data.categoryId,
        products: {
          deleteMany: {},
          create: validated.data.products,
        },
      },
    });

    const updatedForm = await prisma.recipe.findUnique({
      where: { id: id, userId: req.userId },
      include: {
        products: true,
      },
    });

    res.send({ message: "Form was updated", updatedForm });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.get("/recipes/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  try {
    const recipe = await prisma.recipe.findUnique({
      where: { id: id },
      include: {
        products: true,
      },
    });

    if (recipe) {
      res.json(recipe);
    } else {
      res.status(404).send({ message: "Recipe not found" });
    }
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.post("/recipes", AuthMiddleware, async (req: AuthRequest, res) => {
  const { name, categoryId, products } = req.body;

  if (!name || !categoryId || !products || !Array.isArray(products)) {
    return res
      .status(400)
      .send({ message: "name, categoryId, and products are required" });
  }

  try {
    const userExists = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!userExists) {
      return res.status(404).send({ message: "User not found" });
    }

    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!categoryExists) {
      return res.status(404).send({ message: "Category not found" });
    }

    const newRecipe = await prisma.recipe.create({
      data: {
        name,
        category: {
          connect: {
            id: categoryId,
          },
        },
        user: {
          connect: {
            id: req.userId,
          },
        },
        products: {
          create: products.map((product) => ({
            product: {
              connect: {
                id: product.productId,
              },
            },
          })),
        },
      },
    });

    res.status(201).send({
      message: "New recipe was added!",
      newRecipe,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong", error: error });
  }
});

app.delete("/recipes/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }
  const recipeId = Number(req.params.id);
  if (isNaN(recipeId)) {
    res.status(400).send({ message: "Invalid ID format" });
    return;
  }

  try {
    const deleteRecipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        products: true,
        recipeMeals: true,
      },
    });
    if (!deleteRecipe) {
      res.status(404).send({ message: "Recipe not found!" });
      return;
    }

    await prisma.productRecipe.deleteMany({
      where: {
        recipeId: recipeId,
      },
    });

    await prisma.recipeMeal.deleteMany({
      where: {
        recipeId: recipeId,
      },
    });

    await prisma.recipe.delete({ where: { id: recipeId } });

    res.status(200).send({ message: "Recipe was deleted!" });
  } catch (error) {
    console.error("Error deleting recipe:", error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.delete("/products/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }
  const productId = Number(req.params.id);
  if (isNaN(productId)) {
    res.status(400).send({ message: "Invalid ID format" });
    return;
  }

  try {
    const productToDelete = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        recipes: true,
      },
    });

    if (!productToDelete) {
      res.status(404).send({ message: "Product not found!" });
      return;
    }

    await prisma.productRecipe.deleteMany({
      where: { productId: productId },
    });

    await prisma.product.delete({ where: { id: productId } });

    res.status(200).send({ message: "Product was deleted!" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.post("/meals", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  const { name, categoryId, recipeId } = req.body;

  if (!name || !categoryId || !recipeId) {
    return res
      .status(400)
      .send({ message: "name, categoryId, and recipeId are required" });
  }

  try {
    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!categoryExists) {
      return res.status(404).send({ message: "Category not found" });
    }

    const recipeExists = await prisma.recipe.findUnique({
      where: { id: recipeId },
    });

    if (!recipeExists) {
      return res.status(404).send({ message: "Recipe not found" });
    }

    const newMeal = await prisma.meal.create({
      data: {
        name,
        user: {
          connect: {
            id: req.userId,
          },
        },
        recipeMeals: {
          create: {
            recipe: {
              connect: {
                id: recipeId,
              },
            },
            category: {
              connect: {
                id: categoryId,
              },
            },
          },
        },
      },
    });

    res.status(201).send({
      message: "New meal was created!",
      newMeal,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong", error: error });
  }
});

app.get("/meals", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  try {
    const meals = await prisma.meal.findMany({
      select: {
        id: true,
        name: true,
        recipeMeals: {
          select: {
            recipe: true,
            category: true,
          },
        },
      },
    });
    res.json(meals);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    try {
      const userToLogin = await prisma.user.findUnique({
        where: {
          email: email,
        },
      });

      if (userToLogin && userToLogin.password === password) {
        const token = toToken({ userId: userToLogin.id });
        res.status(200).send({ token: token });
      } else {
        res.status(400).send({ message: "Login failed" });
      }
    } catch (error) {
      res.status(500).send({ message: "Something went wrong!" });
    }
  } else {
    res.status(400).send({ message: "'email' and 'password' are required!" });
  }
});

app.post("/register", async (req, res) => {
  const bodyFromReq = req.body;
  const validated = UserDataValidator.safeParse(bodyFromReq);

  if (validated.success) {
    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: validated.data.email },
      });

      if (existingUser) {
        return res.status(409).send({ error: "User already exists" });
      }

      const newUser = await prisma.user.create({
        data: {
          name: validated.data.name,
          email: validated.data.email,
          password: validated.data.password,
        },
      });
      const token = toToken({ userId: newUser.id });
      res
        .status(201)
        .send({ message: "User created", user: newUser, token: token });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).send({ error: "Something went wrong" });
    }
  } else {
    res.status(400).send(validated.error.flatten());
  }
});

app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  const parsed = EmailValidator.safeParse(email);

  console.log({ parsed, error: parsed.error });

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 час

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset",
      text: `You requested a password reset. Click the link to reset your password: http://localhost:3000/reset-password?token=${resetToken}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ error: "Error sending email" });
      }
      res
        .status(200)
        .json({ message: "Password reset link sent to your email" });
    });
  } catch (error) {
    console.log({ error });
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// console.log(`Current working directory: ${__dirname}`);

app.listen(port, () => console.log(`Listening on port: ${port}`));
