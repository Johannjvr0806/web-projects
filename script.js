const form = document.getElementById('todo-form');
const input = document.getElementById('todo-input');
const list = document.getElementById('todo-list');
const counter = document.getElementById('task-counter');
const filterBtns = document.querySelectorAll('.filter-btn');
const clearCompletedBtn = document.getElementById('clear-completed-btn');

let todos = JSON.parse(localStorage.getItem('todos')) || [];
let currentFilter = 'all';

function saveAndRender() {
    localStorage.setItem('todos', JSON.stringify(todos));
    render();
}

function render() {
    list.innerHTML = '';

    const filteredTodos = todos.filter(todo => {
        if (currentFilter === 'active') return !todo.completed;
        if (currentFilter === 'completed') return todo.completed;
        return true;
    });

    filteredTodos.forEach((todo, index) => {
        const originalIndex = todos.indexOf(todo);
        const li = document.createElement('li');
        if (todo.completed) li.classList.add('completed');

        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = todo.text;
        span.onclick = () => toggleTodo(originalIndex);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = () => deleteTodo(originalIndex);

        li.appendChild(span);
        li.appendChild(deleteBtn);
        list.appendChild(li);
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

form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text) {
        todos.push({ text, completed: false });
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