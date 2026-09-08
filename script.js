const themeBtn = document.getElementById('theme-btn');
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');

// 1. Theme Toggle State
let currentTheme = localStorage.getItem('theme') || 'light';
if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.textContent = 'Switch to Light Mode';
}

themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// 2. To-Do List Management
let todos = JSON.parse(localStorage.getItem('todos')) || [];

function saveAndRender() {
    localStorage.setItem('todos', JSON.stringify(todos));
    todoList.innerHTML = '';
    
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        if (todo.completed) li.classList.add('completed');
        
        li.innerHTML = `
            <span onclick="toggleTodo(${index})">${todo.text}</span>
            <button class="delete-btn" onclick="deleteTodo(${index})">X</button>
        `;
        todoList.appendChild(li);
    });
}

todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (text) {
        todos.push({ text: text, completed: false });
        todoInput.value = '';
        saveAndRender();
    }
});

window.toggleTodo = (index) => {
    todos[index].completed = !todos[index].completed;
    saveAndRender();
};

window.deleteTodo = (index) => {
    todos.splice(index, 1);
    saveAndRender();
};

saveAndRender();