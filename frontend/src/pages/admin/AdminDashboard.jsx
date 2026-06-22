import { Line, Bar, Doughnut } from "react-chartjs-2";
import "../../lib/chartSetup";
import StatCard from "../../components/ui/StatCard";
import { revenueMonthly, attemptsMonthly } from "../../data/admin";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export default function AdminDashboard() {
  const revenueData = {
    labels: months,
    datasets: [
      {
        label: "Revenue (₹)",
        data: revenueMonthly,
        borderColor: "#2563eb",
        backgroundColor: "rgba(37,99,235,0.12)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const attemptsData = {
    labels: months,
    datasets: [
      {
        label: "Quiz Attempts",
        data: attemptsMonthly,
        backgroundColor: "#f97316",
        borderRadius: 8,
      },
    ],
  };

  const planData = {
    labels: ["Free", "Premium", "Pro"],
    datasets: [
      {
        data: [62, 28, 10],
        backgroundColor: ["#cbd5e1", "#2563eb", "#f97316"],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400">Platform overview & analytics.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="Users" label="Total Users" value="1,20,480" sub="+4.2% this week" accent="brand" />
        <StatCard icon="Activity" label="Active Users" value="38,210" sub="+1.8% today" accent="green" />
        <StatCard icon="IndianRupee" label="Revenue (MTD)" value="₹89,000" sub="+23.6%" accent="accent" />
        <StatCard icon="ListChecks" label="Quiz Attempts" value="4,200" sub="+35% this month" accent="violet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6 lg:col-span-2">
          <h3 className="mb-4 font-bold">Revenue Trend</h3>
          <div className="h-64">
            <Line data={revenueData} options={{ plugins: { legend: { display: false } } }} />
          </div>
        </div>
        <div className="card p-6">
          <h3 className="mb-4 font-bold">Subscription Mix</h3>
          <div className="mx-auto h-64 max-w-xs">
            <Doughnut data={planData} options={{ plugins: { legend: { position: "bottom" } } }} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-bold">Quiz Attempts by Month</h3>
        <div className="h-72">
          <Bar data={attemptsData} options={{ plugins: { legend: { display: false } } }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { l: "Avg. Test Score", v: "68%" },
          { l: "Completion Rate", v: "81%" },
          { l: "Pass Percentage", v: "74%" },
        ].map((s) => (
          <div key={s.l} className="card p-6 text-center">
            <p className="text-3xl font-extrabold text-brand-600 dark:text-brand-400">{s.v}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
