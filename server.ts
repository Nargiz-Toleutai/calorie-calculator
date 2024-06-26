import express, { json } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import { toToken } from "./auth/jwt";
import { AuthMiddleware, AuthRequest } from "./auth/middelware";
import { z } from "zod";
import path from "path";
import nodemailer from "nodemailer";
import crypto from "crypto";

import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());

app.use(
  "/images",
  express.static(path.join(__dirname, "./prisma/data/products"))
);

const port = 3001;

const prisma = new PrismaClient();

app.use(json());

const EmailValidator = z.string().email({ message: "Invalid email address" });

const UserDataValidator = z
  .object({
    name: z.string().min(1, {
      message: "Name should have a minimum length of 1 character",
    }),
    email: EmailValidator,
    password: z.string().min(10, {
      message: "Password should have a minimum length of 10 characters",
    }),
  })
  .strict();

const AdditionalUserDataValidator = z
  .object({
    userId: z.number().int(),
    weight: z.number().min(40, {
      message: "Weight should be a minimum of 40kg",
    }),
    height: z.number().min(30, {
      message: "Height should be a minimum of 30cm",
    }),
    age: z.number().min(18, {
      message: "Age should be a minimum of 18",
    }),
    gender: z.boolean(),
    activityLevel: z.number().min(1, {
      message: "Activity level should be a minimum of 1",
    }),
    targetDeficitPercent: z.number().min(0, {
      message: "Deficit percentage should be a minimum of 0",
    }),
  })
  .strict();

app.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    res.json(users);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong" });
  }
});

app.get("/user/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    res.status(400).send({ message: "Invalid user ID" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        meal: true,
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

app.patch("/user/:id", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

  const id = Number(req.params.id);

  if (isNaN(id)) {
    return res.status(400).send({ message: "Invalid ID format" });
  }

  const validated = AdditionalUserDataValidator.safeParse(req.body);

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  try {
    const currentForm = await prisma.user.findUnique({
      where: { id: id },
      include: {
        meals: true,
      },
    });

    if (!currentForm || currentForm.id !== req.userId) {
      return res.status(404).send({ message: "Form not found" });
    }

    const updatedForm = await prisma.user.update({
      where: { id: id },
      data: validated.data,
    });

    res.send({ message: "Form was updated", updatedForm });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Something went wrong!" });
  }
});

app.get("/categories", async (req, res) => {
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

app.post("/recipes", AuthMiddleware, async (req: AuthRequest, res) => {
  if (!req.userId) {
    return res.status(401).send("You are not authorized");
  }

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
            quantity: product.quantity,
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
      console.log(validated);
      const newUser = await prisma.user.create({
        data: {
          name: validated.data.name,
          email: validated.data.email,
          password: validated.data.password,
        },
      });
      res.status(201).send({ message: "User created", user: newUser });
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

app.listen(port, () => console.log(`Listening on port: ${port}`));
