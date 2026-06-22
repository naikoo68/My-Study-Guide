// Central Chart.js registration so charts work across the app.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend
);

ChartJS.defaults.font.family = "Inter, sans-serif";
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;

export default ChartJS;
