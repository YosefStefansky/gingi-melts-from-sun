// Aggregation functions
function aggregateByMonths(data) {
  const monthlyTotals = {};
  data.forEach(entry => {
    const month = entry.date.substring(0, 7); // YYYY-MM
    monthlyTotals[month] = (monthlyTotals[month] || 0) + entry.value;
  });
  return {
    labels: Object.keys(monthlyTotals),
    values: Object.values(monthlyTotals)
  };
}

function aggregateByWeeks(data) {
  const weekTotals = {};
  data.forEach(entry => {
    const dateObj = new Date(entry.date);
    const weekNumber = getWeekNumber(dateObj);
    const label = `${dateObj.getFullYear()}-W${weekNumber}`;
    weekTotals[label] = (weekTotals[label] || 0) + entry.value;
  });
  return {
    labels: Object.keys(weekTotals),
    values: Object.values(weekTotals)
  };
}

function aggregateTotal(data) {
  const sum = data.reduce((total, entry) => total + entry.value, 0);
  return {
    labels: ['Total'],
    values: [sum]
  };
}

// Helper to get week number from date
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function setView(view) {
  let result;
  if (view === 'months') {

    result = aggregateByMonths(rawData);
  } else if (view === 'weeks') {
    result = aggregateByWeeks(rawData);
  } else if (view === 'total') {
    result = aggregateTotal(rawData);
  }
  renderChart(result.labels, result.values);
}
const ctx = document.getElementById('myChart').getContext('2d');

const rawData = [
  { date: '2022-01-03', value: 10 },
  { date: '2022-01-07', value: 20 },
  { date: '2022-01-12', value: 15 },
  { date: '2022-02-04', value: 30 },
  { date: '2022-02-17', value: 25 },
  { date: '2022-03-05', value: 5 },
  { date: '2022-03-14', value: 8 },
  { date: '2022-05-02', value: 60 },
  { date: '2022-07-15', value: 40 },
  { date: '2022-10-10', value: 50 }
];

let chart;

function renderChart(labels, values) {
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Data',
        data: values,
        backgroundColor: '#6A7BA2',
        borderRadius: 20,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

setView('months');

const tabs = document.querySelectorAll(".tab");

  tabs.forEach(input => {
    input.addEventListener("click", () => {
      // Remove active class from all inputs
      tabs.forEach(i => i.classList.remove("active"));

      // Add active class to clicked input
      input.classList.add("active");
    });
  });


// new Chart(ctx, {
//   type: 'bar',
//   data: {
//     labels: ['12/22', '11/22', '10/22', '09/22', '08/22', '07/22', '06/22', '05/22', '04/22', '03/22', '02/22', '01/22'],
//     datasets: [{
//       label: '',
//       data: [0, 0, 6, 0, 2, 6, 0, 9, 0, 1, 4, 6],
//       backgroundColor: 'rgba(86, 110, 156, 0.9)',
//       borderRadius: 40, // Rounded bars
//       barPercentage: 0.6
//     }]
//   },
//   options: {
//     responsive: true,
//     plugins: {
//       legend: { display: false },
//       tooltip: { enabled: false }
//     },
//     scales: {
//       x: {
//         grid: {
//           drawOnChartArea: false,
//           color: '#ccc'
//         },
//         ticks: {
//           color: '#151336',
//           font: { size: 14 }
//         }
//       },
//       y: {
//         beginAtZero: true,
//         grid: {
//           color: '#ccc'
//         },
//         ticks: {
//           color: '#151336',
//           font: { size: 14 }
//         }
//       }
//     }
//   }
// });