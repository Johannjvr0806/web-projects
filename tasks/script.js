let tasks = JSON.parse(localStorage.getItem('tasks_app_data')) || [];
let currentFilter = 'all';

const themeToggle = document.getElementById('theme-toggle');
let isDarkMode = localStorage.getItem('theme') === 'dark';

if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
});

const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const dueDateInput = document.getElementById('due-date-input');
const priorityInput = document.getElementById('priority-input');
const searchInput = document.getElementById('search-input');
const taskList = document.getElementById('task-list');
const taskCount = document.getElementById('task-count');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clear-completed');

function saveTasks() {
    localStorage.setItem('tasks_app_data', JSON.stringify(tasks));
    renderTasks();
}

function renderTasks() {
    taskList.innerHTML = '';
    const searchTerm = searchInput.value.toLowerCase();

    const filtered = tasks.filter(task => {
        const matchesFilter = 
            currentFilter === 'all' ||
            (currentFilter === 'active' && !task.completed) ||
            (currentFilter === 'completed' && task.completed);
        const matchesSearch = task.text.toLowerCase().includes(searchTerm);
        return matchesFilter && matchesSearch;
    });

    filtered.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.completed ? 'completed' : ''}`;

        const subtasksHTML = (task.subtasks || []).map((st, i) => `
            <li class="subtask-item">
                <input type="checkbox" ${st.completed ? 'checked' : ''} onchange="toggleSubtask(${task.id}, ${i})">
                <span style="${st.completed ? 'text-decoration: line-through;' : ''}">${st.text}</span>
            </li>
        `).join('');

        li.innerHTML = `
            <div class="task-main">
                <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
                <span class="badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
                <span class="task-text">${task.text}</span>
                ${task.dueDate ? `<span class="due-date">${task.dueDate}</span>` : ''}
                <button class="subtask-btn" onclick="addSubtask(${task.id})">+ Subtask</button>
                <button class="delete-btn" onclick="deleteTask(${task.id})">×</button>
            </div>
            ${task.subtasks && task.subtasks.length > 0 ? `<ul class="subtasks-list">${subtasksHTML}</ul>` : ''}
        `;

        taskList.appendChild(li);
    });

    const completedCount = tasks.filter(t => t.completed).length;
    taskCount.textContent = `${completedCount} of ${tasks.length} tasks completed`;
}

taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;

    tasks.push({
        id: Date.now(),
        text,
        dueDate: dueDateInput.value,
        priority: priorityInput.value,
        completed: false,
        subtasks: []
    });

    taskInput.value = '';
    dueDateInput.value = '';
    priorityInput.value = 'Medium';
    saveTasks();
});

window.toggleTask = function(id) {
    tasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    saveTasks();
};

window.deleteTask = function(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
};

window.addSubtask = function(id) {
    const text = prompt('Enter subtask:');
    if (!text) return;
    tasks = tasks.map(t => {
        if (t.id === id) {
            const subtasks = t.subtasks || [];
            return { ...t, subtasks: [...subtasks, { text, completed: false }] };
        }
        return t;
    });
    saveTasks();
};

window.toggleSubtask = function(taskId, subIndex) {
    tasks = tasks.map(t => {
        if (t.id === taskId) {
            const subtasks = [...t.subtasks];
            subtasks[subIndex].completed = !subtasks[subIndex].completed;
            return { ...t, subtasks };
        }
        return t;
    });
    saveTasks();
};

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderTasks();
    });
});

clearCompletedBtn.addEventListener('click', () => {
    tasks = tasks.filter(t => !t.completed);
    saveTasks();
});

searchInput.addEventListener('input', renderTasks);

renderTasks();