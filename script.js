const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const dueDateInput = document.getElementById('due-date-input');
const priorityInput = document.getElementById('priority-input');
const searchInput = document.getElementById('search-input');
const list = document.getElementById('todo-list');
const counter = document.getElementById('task-counter');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const themeToggle = document.getElementById('theme-toggle');

let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all';
let searchQuery = '';
let isDarkMode = localStorage.getItem('theme') === 'dark';

if (isDarkMode) {
    document.body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    themeToggle.textContent = isDarkMode ? '☀️' : '🌙';
});

function saveAndRender() {
    localStorage.setItem('todos', JSON.stringify(todos));
    render();
}

function render() {
    list.innerHTML = '';

    todos.forEach((todo, index) => {
        if (currentFilter === 'active' && todo.completed) return;
        if (currentFilter === 'completed' && !todo.completed) return;
        if (searchQuery && !todo.text.toLowerCase().includes(searchQuery.toLowerCase())) return;

        const container = document.createElement('li');
        container.className = 'todo-item-container';

        const mainDiv = document.createElement('div');
        mainDiv.className = `todo-main ${todo.completed ? 'completed' : ''}`;
        mainDiv.draggable = true;

        const badge = document.createElement('span');
        badge.className = `badge ${todo.priority || 'medium'}`;
        badge.textContent = todo.priority || 'medium';

        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = todo.text;
        span.onclick = () => toggleTodo(index);

        const dueDate = document.createElement('span');
        dueDate.className = 'due-date';
        dueDate.textContent = todo.dueDate ? todo.dueDate : '';

        const subtaskBtn = document.createElement('button');
        subtaskBtn.className = 'subtask-toggle';
        subtaskBtn.textContent = '➕ Subtask';
        subtaskBtn.onclick = () => toggleSubtaskForm(index);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => deleteTodo(index);

        mainDiv.appendChild(badge);
        mainDiv.appendChild(span);
        if (todo.dueDate) mainDiv.appendChild(dueDate);
        mainDiv.appendChild(subtaskBtn);
        mainDiv.appendChild(deleteBtn);

        container.appendChild(mainDiv);

        if (todo.subtasks && todo.subtasks.length > 0) {
            const subtaskContainer = document.createElement('div');
            subtaskContainer.className = 'subtasks';
            
            todo.subtasks.forEach((st, stIndex) => {
                const stDiv = document.createElement('div');
                stDiv.className = `subtask-item ${st.completed ? 'completed' : ''}`;

                const stCheckbox = document.createElement('input');
                stCheckbox.type = 'checkbox';
                stCheckbox.checked = st.completed;
                stCheckbox.onchange = () => toggleSubtask(index, stIndex);

                const stText = document.createElement('span');
                stText.textContent = st.text;

                stDiv.appendChild(stCheckbox);
                stDiv.appendChild(stText);
                subtaskContainer.appendChild(stDiv);
            });
            container.appendChild(subtaskContainer);
        }

        if (todo.showSubtaskForm) {
            const stForm = document.createElement('form');
            stForm.className = 'subtask-form';
            const stInput = document.createElement('input');
            stInput.placeholder = 'New subtask...';
            const stAddBtn = document.createElement('button');
            stAddBtn.type = 'submit';
            stAddBtn.textContent = 'Add';

            stForm.onsubmit = (e) => {
                e.preventDefault();
                if (stInput.value.trim()) {
                    if (!todo.subtasks) todo.subtasks = [];
                    todo.subtasks.push({ text: stInput.value.trim(), completed: false });
                    todo.showSubtaskForm = false;
                    saveAndRender();
                }
            };

            stForm.appendChild(stInput);
            stForm.appendChild(stAddBtn);
            container.appendChild(stForm);
        }

        list.appendChild(container);
    });

    updateCounter();
}

function updateCounter() {
    const completedCount = todos.filter(t => t.completed).length;
    counter.textContent = `${completedCount} of ${todos.length} tasks completed`;
}

function toggleTodo(index) {
    todos[index].completed = !todos[index].completed;
    saveAndRender();
}

function deleteTodo(index) {
    todos.splice(index, 1);
    saveAndRender();
}

function toggleSubtaskForm(index) {
    todos[index].showSubtaskForm = !todos[index].showSubtaskForm;
    saveAndRender();
}

function toggleSubtask(todoIndex, stIndex) {
    todos[todoIndex].subtasks[stIndex].completed = !todos[todoIndex].subtasks[stIndex].completed;
    saveAndRender();
}

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const dueDate = dueDateInput.value;
    const priority = priorityInput.value;
    if (text) {
        todos.push({ text, completed: false, priority, dueDate, subtasks: [] });
        input.value = '';
        dueDateInput.value = '';
        saveAndRender();
    }
});

searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
});

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        render();
    });
});

clearCompletedBtn.addEventListener('click', () => {
    todos = todos.filter(t => !t.completed);
    saveAndRender();
});

render();
