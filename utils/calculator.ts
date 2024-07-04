export interface RecipesDataToCalculate {
  recipesByCategory: {
    [category: string]: {
      recipes: {
        products: {
          id: number;
          name: string;
          unit: string;
          quantity: number;
          protein: number;
          carbs: number;
          fat: number;
          calories: number;
          image: string;
          portion: number;
        }[];

        id: number;
        name: string;
        categoryId: number;
        category: {
          id: number;
          name: string;
          icon: string;
        };
      }[];
      total?: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
      };
    };
  };
  total: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

const ACTIVITY_LEVEL_FACTOR_MAP = {
  1: 1.2,
  2: 1.375,
  3: 1.55,
  4: 1.725,
  5: 1.9,
};

export type ActivityLevel = keyof typeof ACTIVITY_LEVEL_FACTOR_MAP;

export const calulateCPCF = (
  gender: "male" | "female",
  weight: number,
  height: number,
  age: number,
  activityLevel: ActivityLevel,
  targetDeficitPercent: number
) => {
  const BMR =
    gender === "male"
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

  const proteinPerKg = gender === "male" ? 1.6 : 1.4;

  const tdee = ACTIVITY_LEVEL_FACTOR_MAP[activityLevel] * BMR;

  const calorieDeficit = tdee * (1 - targetDeficitPercent / 100);

  const proteinIntake = proteinPerKg * weight;

  const fatIntake = (calorieDeficit * 0.25) / 9;

  const carbsIntake = (calorieDeficit - proteinIntake * 4 - fatIntake * 9) / 4;

  const caloriesFromPFC = proteinIntake * 4 + carbsIntake * 4 + fatIntake * 9;

  return {
    calories: Math.floor(caloriesFromPFC),
    protein: Math.floor(proteinIntake),
    carbs: Math.floor(carbsIntake),
    fat: Math.floor(fatIntake),
  };
};

const NUTRIENTS: ("protein" | "carbs" | "fat")[] = ["protein", "carbs", "fat"];

export const calculatePortions = (data: RecipesDataToCalculate): Object => {
  const categoriesCount = Object.keys(data.recipesByCategory).length;

  const cpcfByCategory = {
    calories: Math.floor(data.total.calories / categoriesCount),
    protein: Math.floor(data.total.protein / categoriesCount),
    carbs: Math.floor(data.total.carbs / categoriesCount),
    fat: Math.floor(data.total.fat / categoriesCount),
  };

  for (const categoryData of Object.values(data.recipesByCategory)) {
    Object.assign(categoryData, { total: cpcfByCategory });

    const recipesCount = categoryData.recipes.length;
    const cpcfByRecipe = {
      calories: Math.floor(cpcfByCategory.calories / recipesCount),
      protein: Math.floor(cpcfByCategory.protein / recipesCount),
      carbs: Math.floor(cpcfByCategory.carbs / recipesCount),
      fat: Math.floor(cpcfByCategory.fat / recipesCount),
    };

    for (const recipe of categoryData.recipes) {
      const mostValuableProduct: {
        [nutrient: string]: (typeof recipe.products)[number];
      } = {};

      for (const product of recipe.products) {
        for (const nutrient of NUTRIENTS) {
          if (
            !mostValuableProduct[nutrient] ||
            mostValuableProduct[nutrient][nutrient] <= product[nutrient]
          )
            mostValuableProduct[nutrient] = product;
        }
      }

      const cpcf = { ...cpcfByRecipe };

      for (const nutrient of NUTRIENTS) {
        if (cpcf[nutrient] <= 0) continue;

        const nutrientProduct = mostValuableProduct[nutrient];

        for (const product of recipe.products) {
          if (nutrientProduct !== product) continue;
          product.portion =
            (cpcf[nutrient] / product[nutrient]) * product.quantity;

          for (const extraNutrient of NUTRIENTS) {
            if (extraNutrient === nutrient) continue;

            cpcf[nutrient] -= product[nutrient] * product.quantity;
          }
        }
      }
    }
  }

  return data;
};
