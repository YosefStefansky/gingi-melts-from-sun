document.addEventListener("DOMContentLoaded", function () {
    const ctx = document.getElementById('userChart').getContext('2d');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['7', '6', '5', '4', '3', '2', '1'],
            datasets: [{
                label: 'Users',
                data: [5, 10, 30, 15, 5, 10, 20],
                backgroundColor: '#6c7890'
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
});

document.querySelectorAll("#statusList li").forEach(li => {
    li.addEventListener("click", function () {
      document.querySelectorAll("#statusList li").forEach(el => el.classList.remove("active"));
      this.classList.add("active");
    });
  });

  function authenticateAndNavigate() {
    // Example: Replace with your real authentication logic
    let isAuthenticated = confirm("Are you logged in?");

    if (isAuthenticated) {
        // If authenticated → navigate
        window.location.href = "otherpage.html";
    } else {
        // If not authenticated → show a message
        alert("You must log in first!");
        window.location.href = "login.html"; // Optional: send to login page
    }
}

function login() {
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;

      // For demo purposes: hardcoded credentials
      if (username === "admin" && password === "123456") {
        // Save token/flag to localStorage
        localStorage.setItem("authToken", "mysecrettoken");
        alert("Login successful!");
        window.location.href = "welcome.html"; // redirect to main page
      } else {
        alert("Invalid username or password");
      }
    }

// Catch Enter key
document.addEventListener("keydown", function(event) {
   if (event.key === "Enter") {
     login();
   }
});