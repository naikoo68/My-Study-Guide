import { useState } from "react";
import { Mail, Phone, MapPin, Send, CheckCircle2 } from "lucide-react";

const info = [
  { icon: Mail, label: "Email", value: "hello@myprepmart.com" },
  { icon: Phone, label: "Phone", value: "+91 98765 43210" },
  { icon: MapPin, label: "Address", value: "Knowledge Park, New Delhi, India" },
];

export default function Contact() {
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-2xl text-center">
        <span className="badge bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">Contact</span>
        <h1 className="mt-4 text-4xl font-extrabold">Get in touch</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Questions, feedback or partnership ideas — we'd love to hear from you.
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          {info.map((i) => (
            <div key={i.label} className="card flex items-center gap-4 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300">
                <i.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{i.label}</p>
                <p className="font-semibold">{i.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="card p-6 lg:col-span-2">
          {sent ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              <h3 className="mt-4 text-xl font-bold">Message sent!</h3>
              <p className="mt-2 text-slate-600 dark:text-slate-400">
                Thanks for reaching out. Our team will reply within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Full Name</label>
                  <input required className="input" placeholder="Your name" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Email</label>
                  <input required type="email" className="input" placeholder="you@example.com" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Subject</label>
                <input required className="input" placeholder="How can we help?" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Message</label>
                <textarea required rows={5} className="input resize-none" placeholder="Write your message..." />
              </div>
              <button type="submit" className="btn-primary w-full sm:w-auto">
                <Send className="h-4 w-4" /> Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
