// Built-in default FAQ content for the public /faq page, grouped by audience.
// These ship with the app and are shown when an admin hasn't customised the
// FAQs for that audience (settings.faqs.<audience> empty). Admins can override
// them per audience from Admin → Customization → FAQ. Shared by Faq.jsx (render
// + fallback) and AdminCustomization.jsx (pre-fill the editor), so there's a
// single source of truth. Answers are plain, factual descriptions — no
// fabricated prices/numbers; current rates live on the Pricing page.

export const FAQ_DEFAULTS = {
  student: [
    {
      q: "What is My Study Guide?",
      a: "My Study Guide is an online exam-preparation platform. It offers subject-wise quizzes, full-length mock tests and test series, practice questions and study materials, organised by stream, subject and topic, with instant results and performance analytics.",
    },
    {
      q: "Is My Study Guide free to use?",
      a: "You can try selected quizzes and tests for free, and shared public links open without any login. Full access to the complete question bank, test series and analytics is available through a subscription plan, and new users can start a free trial.",
    },
    {
      q: "Do I need an account to attempt a quiz or test?",
      a: "No account is needed to open a shared public quiz or test link, or to try free preview content. Creating a free account lets you track your progress, view analytics and access more content.",
    },
    {
      q: "What subjects and streams are covered?",
      a: "Content is organised by stream, then by subject and topic. You can browse everything currently available from the Streams and Subjects pages.",
    },
    {
      q: "How are results and scores shown?",
      a: "Every quiz and test is scored instantly when you submit. You can review your answers with explanations and see performance analytics that highlight your strong and weak areas.",
    },
    {
      q: "What is the difference between a quiz, practice and a test series?",
      a: "Quizzes are short, topic-wise sets you can attempt quickly. Practice mode lets you work through questions by subject and topic at your own pace. Public test series are full-length, timed mock exams that simulate the real exam experience.",
    },
    {
      q: "Can I use My Study Guide on my phone?",
      a: "Yes. The site works on any modern mobile browser and can be installed as an app (PWA) for quick access, so you can practise on the go.",
    },
    {
      q: "How do I subscribe or upgrade?",
      a: "You can view the available plans and subscribe from the Pricing page. Student plans run from monthly up to yearly, and payments are processed securely online.",
    },
    {
      q: "How can I get help or contact support?",
      a: "For any questions or help, use the Contact page to reach the team.",
    },
  ],
  creator: [
    {
      q: "Who is a Creator account for?",
      a: "Creator accounts are for teachers and content creators who want to build and run their own quizzes, test series and study material on My Study Guide and share them with their own students.",
    },
    {
      q: "What do I get with a Creator account?",
      a: "You get your own private My Practice workspace, an AI question generator, tools to build quizzes, test series and previous-year papers, an answer checker with auto-generated notes, document and study-material upload, and performance analytics with progress tracking.",
    },
    {
      q: "How do I get a Creator account?",
      a: "Go to the Creator sign-up page, register and verify your email, then choose a plan. Paid plans activate instantly through secure online payment.",
    },
    {
      q: "Is there a free trial for Creators?",
      a: "Yes. A free trial lets you explore the workspace first. A few features — backing up, restoring and sharing your content with other users — become available once you move to a paid plan.",
    },
    {
      q: "How does Creator pricing work?",
      a: "Creator plans run from monthly up to yearly; longer plans cost less per month and unlock higher AI-generation limits. See the Pricing page for the current rates.",
    },
    {
      q: "Can students use my content without an account?",
      a: "Yes. On a paid plan you can share public links to your quizzes and tests that anyone can open and attempt without logging in.",
    },
    {
      q: "Can I install the workspace as an app?",
      a: "Yes — the My Practice workspace installs as an app (PWA) on your phone or computer for quick access.",
    },
  ],
  institute: [
    {
      q: "Who is an Institute account for?",
      a: "Institute accounts are for coaching centres and schools that want to run their own branded exam-preparation platform for their students.",
    },
    {
      q: "What do I get with an Institute account?",
      a: "You get your own branded space and subdomain, your own admin panel to manage everything, students and content that stay fully isolated from other institutes, all the quiz, test-series and study-material tools, the AI question generator, analytics, and room to grow to unlimited students.",
    },
    {
      q: "How do I set up my institute?",
      a: "Sign up on the Institute registration page and choose a plan. Your branded space is provisioned automatically and activates instantly after secure online payment.",
    },
    {
      q: "Is there a free trial for institutes?",
      a: "Yes, a free trial is available so you can set up and evaluate your institute space before subscribing. See the Pricing page for the current trial length.",
    },
    {
      q: "How does institute pricing work?",
      a: "Institutes have their own plans, separate from student and creator plans, running from monthly up to yearly. See the Pricing page for the current rates.",
    },
    {
      q: "Can I use my own branding?",
      a: "Yes. You can set your institute's name, logo and colours, and your students get their own subdomain, so they see your identity throughout.",
    },
  ],
};
