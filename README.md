# 🧠 Finance App — Backend

This is the **backend** of the Finance App — a NestJS-powered REST API built as a **pet project** by [**Bohdan Hora**](https://github.com/bohdanhora).  
It handles authentication, budgeting logic, transaction management, PDF export, and email functionality.

---

## 🚀 Features

- ✅ JWT authentication with cookies
- 🔐 Google OAuth login via Passport
- 📧 Email sending via **Nodemailer**
- 🧾 MongoDB storage for transactions and users
- 📊 Budget calculations including:
    - Monthly income and expenses
    - Remaining balance until end of month
    - Required (fixed) monthly payments
- 📄 PDF export of transaction history using `pdfmake`
- 📁 Modular architecture with clear separation of concerns

---

## 🛠️ Tech Stack

| Tech                | Description                          |
| ------------------- | ------------------------------------ |
| **NestJS**          | Node.js framework (v11)              |
| **TypeScript**      | Strongly typed language              |
| **MongoDB**         | NoSQL database                       |
| **Mongoose**        | MongoDB ODM                          |
| **Passport.js**     | Auth middleware (Google + JWT)       |
| **pdfmake**         | Server-side PDF generation           |
| **Nodemailer**      | Email delivery (e.g., confirmations) |
| **Class Validator** | DTO validation                       |
| **Jest**            | Testing framework                    |
| **Supertest**       | E2E API testing                      |

---

## 📦 Scripts

```bash
npm run start:dev    # Start the app in development mode
npm run build        # Compile TypeScript to JavaScript
npm run start        # Run compiled production app
npm run test         # Run all unit tests
npm run test:watch   # Watch files and run tests on change
npm run test:e2e     # Run end-to-end tests
npm run lint         # Run ESLint
npm run format       # Format source files using Prettier
```

---

## 🔐 Authentication

JWT-based authentication with access and refresh tokens

Google OAuth 2.0 login via Passport strategy

Sessions stored in secure HttpOnly cookies

---

## 📄 PDF Export

The backend generates printable PDF reports of income and expense history using pdfmake.
These reports are requested from the frontend and served as downloadable files.

---

## 🚧 Disclaimer

This backend is built for educational and experimental use only.
It is not optimized for production use.

---

## 👤 Author

**Bohdan Hora**
🔗 GitHub: [@bohdanhora](https://github.com/bohdanhora)
