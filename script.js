const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const priorityInput = document.getElementById('priority-input');
const list = document.getElementById('todo-list');
const counter = document.getElementById('task-counter');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const themeToggle = document.getElementById('theme-toggle');

let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all';
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

        const li = document.createElement('li');
        li.draggable = true;
        li.dataset.index = index;
        if (todo.completed) li.classList.add('completed');

        const badge = document.createElement('span');
        badge.className = `badge ${todo.priority || 'medium'}`;
        badge.textContent = todo.priority || 'medium';

        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = todo.text;
        
        span.onclick = () => toggleTodo(index);
        span.ondblclick = () => makeEditable(span, index);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => deleteTodo(index);

        li.appendChild(badge);
        li.appendChild(span);
        li.appendChild(deleteBtn);

        addDragListeners(li);
        list.appendChild(li);
    });

    updateCounter();
}

function makeEditable(span, index) {
    const currentText = todos[index].text;
    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'edit-input';
    editInput.value = currentText;

    span.replaceWith(editInput);
    editInput.focus();

    const saveEdit = () => {
        const val = editInput.value.trim();
        if (val) {
            todos[index].text = val;
            saveAndRender();
        } else {
            render();
        }
    };

    editInput.addEventListener('blur', saveEdit);
    editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit();
    });
}

function addDragListeners(li) {
    li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        e.dataTransfer.setData('text/plain', li.dataset.index);
    });

    li.addEventListener('dragend', () => li.classList.remove('dragging'));

    li.addEventListener('dragover', (e) => e.preventDefault());

    li.addEventListener('drop', (e) => {
        e.preventDefault();
        const draggedIdx = parseInt(e.dataTransfer.getData('text/plain'));
        const targetIdx = parseInt(li.dataset.index);

        const [draggedItem] = todos.splice(draggedIdx, 1);
        todos.splice(targetIdx, 0, draggedItem);
        saveAndRender();
    });
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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    const priority = priorityInput.value;
    if (text) {
        todos.push({ text, completed: false, priority });
        input.value = '';
        saveAndRender();
    }
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