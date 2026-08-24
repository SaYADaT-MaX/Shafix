let token = localStorage.getItem("studyhub_token");
let currentUser = null;
let currentAssignment = null;
let isRegister = false;

const $ = id => document.getElementById(id);

async function api(url, options = {}) {

  options.headers = {
    ...(options.headers || {}),
    ...(token
      ? { Authorization: "Bearer " + token }
      : {})
  };

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}


/* =========================
   START
========================= */

async function startApp() {

  try {

    currentUser = await api("/api/me");

    updateLoginButton();

  } catch {

    currentUser = null;

  }

  showHome();

}

startApp();


/* =========================
   NAVIGATION
========================= */

function hideAll() {

  document.getElementById("home")
    .classList.add("hidden");

  document.getElementById("assignments")
    .classList.add("hidden");

  document.getElementById("submit")
    .classList.add("hidden");

  document.getElementById("login")
    .classList.add("hidden");

}


function showHome() {

  hideAll();

  document.getElementById("home")
    .classList.remove("hidden");

}


async function showAssignments() {

  hideAll();

  const section =
    document.getElementById("assignments");

  section.classList.remove("hidden");

  const container =
    section.querySelector(".assignments");

  container.innerHTML =
    "<p>Loading assignments...</p>";

  try {

    const assignments =
      await api("/api/assignments");

    if (assignments.length === 0) {

      container.innerHTML =
        "<p>এখনো কোনো assignment দেওয়া হয়নি।</p>";

      return;

    }

    container.innerHTML =
      assignments.map(a => `

        <div class="card">

          <div class="subject">
            ${escapeHTML(a.subject)}
          </div>

          <small>
            ${escapeHTML(a.week)}
          </small>

          <h3>
            ${escapeHTML(a.title)}
          </h3>

          <p>
            ${escapeHTML(a.description)}
          </p>

          <button
            class="button"
            onclick="openAssignment(${a.id})">

            Assignment খুলুন

          </button>

        </div>

      `).join("");

  } catch (error) {

    container.innerHTML =
      `<p>${escapeHTML(error.message)}</p>`;

  }

}


/* =========================
   ASSIGNMENT
========================= */

async function openAssignment(id) {

  if (!currentUser) {

    showLogin();

    return;

  }

  try {

    const assignments =
      await api("/api/assignments");

    currentAssignment =
      assignments.find(a => a.id == id);

    if (!currentAssignment) {

      alert("Assignment পাওয়া যায়নি");

      return;

    }

    hideAll();

    document
      .getElementById("submit")
      .classList.remove("hidden");

    document
      .getElementById("assignmentTitle")
      .innerText =
      currentAssignment.subject +
      " — " +
      currentAssignment.title;

    await loadSolutions();

  } catch (error) {

    alert(error.message);

  }

}


/* =========================
   SOLUTIONS
========================= */

async function loadSolutions() {

  const container =
    document.querySelector("#submit .card");

  const oldSolutions =
    document.getElementById("solutionsArea");

  if (oldSolutions) {
    oldSolutions.remove();
  }

  const solutions =
    await api(
      "/api/assignments/" +
      currentAssignment.id +
      "/submissions"
    );

  const area =
    document.createElement("div");

  area.id = "solutionsArea";

  area.innerHTML = `
    <hr>
    <h3>Student Solutions</h3>
  `;

  if (solutions.length === 0) {

    area.innerHTML +=
      "<p>এখনো কোনো solution জমা পড়েনি।</p>";

  } else {

    solutions.forEach(solution => {

      const article =
        document.createElement("article");

      article.className = "card";

      let commentsHTML = "";

      solution.comments.forEach(comment => {

        commentsHTML += `
          <div class="comment">

            <b>
              ${escapeHTML(comment.name)}
            </b>:

            ${escapeHTML(comment.text)}

          </div>
        `;

      });

      article.innerHTML = `

        <b>
          ${escapeHTML(solution.name)}
        </b>

        <div class="answer">
          ${escapeHTML(solution.answer)}
        </div>

        ${commentsHTML}

        <input
          id="comment-${solution.id}"
          placeholder="তোমার comment লিখো">

        <button
          class="button"
          onclick="addComment(${solution.id})">

          Comment

        </button>

      `;

      area.appendChild(article);

    });

  }

  container.appendChild(area);

}


/* =========================
   SUBMIT
========================= */

async function submitAssignment() {

  if (!currentUser) {

    showLogin();

    return;

  }

  const answer =
    document.getElementById("answer").value.trim();

  if (!answer) {

    alert("আগে Solution লিখো!");

    return;

  }

  try {

    await api(
      "/api/assignments/" +
      currentAssignment.id +
      "/submissions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          answer: answer
        })
      }
    );

    document
      .getElementById("submitMessage")
      .innerText =
      "✅ তোমার Solution সফলভাবে জমা হয়েছে!";

    document
      .getElementById("answer")
      .value = "";

    await loadSolutions();

  } catch (error) {

    alert(error.message);

  }

}


/* =========================
   COMMENT
========================= */

async function addComment(submissionId) {

  const input =
    document.getElementById(
      "comment-" + submissionId
    );

  const text =
    input.value.trim();

  if (!text) {

    alert("Comment লিখো!");

    return;

  }

  try {

    await api(
      "/api/submissions/" +
      submissionId +
      "/comments",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          text: text
        })
      }
    );

    input.value = "";

    await loadSolutions();

  } catch (error) {

    alert(error.message);

  }

}


/* =========================
   LOGIN
========================= */

function showLogin() {

  hideAll();

  document
    .getElementById("login")
    .classList.remove("hidden");

}


async function login() {

  const phone =
    document.getElementById("phone").value.trim();

  const password =
    document.getElementById("password").value;

  if (!phone || !password) {

    alert("Phone number এবং password দাও!");

    return;

  }

  try {

    const result =
      await api("/api/login", {

        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          phone: phone,
          password: password
        })

      });

    token = result.token;

    currentUser = result.user;

    localStorage.setItem(
      "studyhub_token",
      token
    );

    updateLoginButton();

    alert(
      "স্বাগতম, " +
      currentUser.name +
      "!"
    );

    showHome();

  } catch (error) {

    document
      .getElementById("loginMessage")
      .innerText =
      "❌ " + error.message;

  }

}


/* =========================
   REGISTER
========================= */

function showRegister() {

  const name =
    prompt("তোমার নাম:");

  if (!name) return;

  const phone =
    prompt("মোবাইল নম্বর:");

  if (!phone) return;

  const password =
    prompt(
      "Password দাও (কমপক্ষে ৮ অক্ষর):"
    );

  if (!password) return;

  registerUser(
    name,
    phone,
    password
  );

}


async function registerUser(
  name,
  phone,
  password
) {

  try {

    await api("/api/register", {

      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        name,
        phone,
        password
      })

    });

    alert(
      "✅ Account তৈরি হয়েছে! এখন Login করো।"
    );

  } catch (error) {

    alert(error.message);

  }

}


/* =========================
   LOGOUT
========================= */

function logout() {

  localStorage.removeItem(
    "studyhub_token"
  );

  token = null;
  currentUser = null;

  updateLoginButton();

  showHome();

}


/* =========================
   LOGIN BUTTON
========================= */

function updateLoginButton() {

  const button =
    document.querySelector(
      "nav button:last-child"
    );

  if (!button) return;

  if (currentUser) {

    button.innerText =
      "Logout";

    button.onclick =
      logout;

  } else {

    button.innerText =
      "Login";

    button.onclick =
      showLogin;

  }

}


/* =========================
   HTML SECURITY
========================= */

function escapeHTML(value) {

  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

    }
