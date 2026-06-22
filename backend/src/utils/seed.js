// Seed script: populates the DB with an admin, sample subjects, sessions,
// questions and a test series. Run with: npm run seed
import "dotenv/config";
import connectDB from "../config/db.js";
import User from "../models/User.js";
import Subject from "../models/Subject.js";
import Session from "../models/Session.js";
import Question from "../models/Question.js";
import TestSeries from "../models/TestSeries.js";

async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Subject.deleteMany({}),
    Session.deleteMany({}),
    Question.deleteMany({}),
    TestSeries.deleteMany({}),
  ]);

  await User.create({
    name: "Admin",
    email: "admin@myprepmart.com",
    password: "admin123",
    role: "admin",
    isEmailVerified: true,
  });
  await User.create({
    name: "Demo Student",
    email: "student@myprepmart.com",
    password: "student123",
    isEmailVerified: true,
  });

  const physics = await Subject.create({
    name: "Physics",
    slug: "physics",
    icon: "Atom",
    description: "Mechanics, thermodynamics and modern physics.",
  });

  const session = await Session.create({
    subject: physics._id,
    title: "Units & Measurements",
    index: 1,
    difficulty: "Easy",
  });

  const questions = await Question.insertMany([
    {
      subject: physics._id,
      session: session._id,
      text: "Which of the following is a base SI unit?",
      options: ["Newton", "Kilogram", "Watt", "Pascal"],
      correct: 1,
      difficulty: "Easy",
      topic: "SI Units",
      explanation: "Kilogram is a base SI unit of mass.",
      status: "published",
    },
    {
      subject: physics._id,
      session: session._id,
      text: "The dimensional formula of force is:",
      options: ["[MLT⁻¹]", "[MLT⁻²]", "[ML²T⁻²]", "[M⁰LT⁻²]"],
      correct: 1,
      difficulty: "Medium",
      topic: "Dimensions",
      explanation: "Force = mass × acceleration = [MLT⁻²].",
      status: "published",
    },
  ]);

  await TestSeries.create({
    name: "Physics Sample Mock",
    category: "Subject-wise",
    duration: 30,
    marks: questions.length * 4,
    difficulty: "Medium",
    questions: questions.map((q) => q._id),
    status: "published",
  });

  console.log("✔ Seed complete. Admin: admin@myprepmart.com / admin123");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
