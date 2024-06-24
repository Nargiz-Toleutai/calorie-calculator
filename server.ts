import express, { json } from "express";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import { toToken } from "./auth/jwt";
import { AuthMiddleware, AuthRequest } from "./auth/middelware";
import { z } from "zod";

const app = express();
app.use(cors());
const port = 3001;

const prisma = new PrismaClient();

app.use(json());

const UserDataValidator = z
  .object({
    name: z.string().min(1, {
      message: "Name should have a minimum length of 1 character",
    }),
    email: z.string().min(5, {
      message: "Email should have a minimum length of 5 characters",
    }),
    password: z.string().min(10, {
      message: "Password should have a minimum length of 10 characters",
    }),
  })
  .strict();

const UserFormValidator = z
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

app.get("/user/:id", async (req, res) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) {
    res.status(400).send({ message: "Invalid user ID" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    const formData = await prisma.userFormData.findUnique({
      where: { id: userId },
      select: {
        weight: true,
        height: true,
        age: true,
        gender: true,
        activityLevel: true,
        targetDeficitPercent: true,
        meal: true,
      },
    });
    if (user) {
      res.json({ user, formData }); // getting basic info and form data
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

  const { id: _id, ...formData } = req.body; // remove id from req.body
  const validated = UserFormValidator.safeParse(formData);

  if (!validated.success) {
    return res.status(400).send(validated.error.flatten());
  }

  try {
    const currentForm = await prisma.userFormData.findUnique({
      where: { id: id },
      include: {
        meal: true,
      },
    });

    if (!currentForm || currentForm.userId !== req.userId) {
      return res.status(404).send({ message: "Form not found" });
    }

    const updatedForm = await prisma.userFormData.update({
      where: { id: id },
      data: formData,
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

app.post("/register", AuthMiddleware, async (req: AuthRequest, res) => {
  const bodyFromReq = req.body;
  const validated = UserDataValidator.safeParse(bodyFromReq);

  if (validated.success) {
    try {
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

app.listen(port, () => console.log(`Listening on port: ${port}`));
