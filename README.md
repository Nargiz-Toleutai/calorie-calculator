# [FitFuel [Calorie calculator] Backend] (https://fitfuel-calorie-calculator.vercel.app)

## Overview

FitFuel Backend is the server-side part of the FitFuel application. It handles user authentication, manages recipes and products, and calculates portion sizes based on the user's calorie requirements for weight loss.

## Features

- **User Authentication**: Secure login and registration functionality.
- **Recipe Management**: Add, edit, and delete recipes.
- **Product Management**: Add, edit, and delete individual products.
- **Calorie and Portion Calculation**: Calculate portion sizes based on the user's calorie requirements for weight loss.

## Getting Started

### Prerequisites

Make sure you have the following installed:

- Node.js
- npm (Node Package Manager)

### Installation

1. Clone the repository:
   ```sh
   git clone git@github.com:Nargiz-Toleutai/calorie-calculator.git
   ```
2. Navigate to the project directory:
   ```sh
   cd calorie-calculator
   ```
3. Install the dependencies:
   ```sh
   npm install
   ```

### Running the Server

1. Create a `.env` file in the server directory and add your environment variables.
2. To start the server in development mode, run:
   ```sh
   npm run dev
   ```
3. To build the application, run:
   ```sh
   npm run build
   ```
4. To start the application in production mode, run:
   ```sh
   npm start
   ```

## Project Structure

```sh
fitfuel-backend/
├── controllers/ # Controllers
├── models/ # Models
├── routes/ # Routes
├── utils/ # Utilities
├── server.ts # Server entry point
├── .env # Environment variables
├── package.json # NPM dependencies and scripts
└── README.md # Server documentation
```

## Dependencies

This project uses the following main dependencies:

- `@prisma/client`: Prisma client for database interaction.
- `@types/express`: Type definitions for Express.
- `cors`: Middleware for enabling CORS.
- `crypto`: Library for cryptographic functionality.
- `dotenv`: Loads environment variables from a .env file.
- `express`: Web framework for Node.js.
- `formidable`: Library for parsing form data, especially file uploads.
- `jsonwebtoken`: JSON Web Token implementation.
- `nodemailer`: Node.js module for sending emails.
- `prisma`: Next-generation ORM for Node.js and TypeScript.
- `tsx`: TypeScript execution environment.
- `typescript`: JavaScript with syntax for types.
- `zod`: TypeScript-first schema declaration and validation library.

## Dev Dependencies

- `@types/*`: TypeScript type definitions for various packages.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any bugs, feature requests, or improvements.

## Acknowledgements

- Thanks to the developers of all the open-source packages used in this project.

---

Feel free to reach out if you have any questions or need further assistance.

Happy coding!
