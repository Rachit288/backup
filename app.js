let config = null,
    records = [],
    editingId = null;

const $ = (s) => document.querySelector(s);

const esc = (s) =>
    String(s ?? '').replace(
        /[&<>"']/g,
        (c) =>
        ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[c])
    );

async function api(url, options = {}) {
    const r = await fetch(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
}

async function init() {
    try {
        config = await api('/api/config');
        $('#brand').textContent = config.appName;
        $('#listHeading').textContent = config.entityNamePlural;
        await loadRecords();
        setupTasks();
    } catch (e) {
        $('#message').textContent = e.message;
    }
}

async function loadRecords() {
    records = await api(
        '/api/records?q=' + encodeURIComponent($('#search').value)
    );
    renderStats();
    renderTable();
}

function renderStats() {
    const total = records.length;
    const available = records.reduce(
        (n, r) => n + Number(r.available || 0),
        0
    );
    $('#stats').innerHTML = `
    <div class="col-6 col-md-4">
      <div class="stat-card">
        <div class="stat-label">Records shown</div>
        <div class="stat-value">${total}</div>
      </div>
    </div>
    <div class="col-6 col-md-4">
      <div class="stat-card">
        <div class="stat-label">Available copies (if applicable)</div>
        <div class="stat-value">${available}</div>
      </div>
    </div>
    <div class="col-12 col-md-4">
      <div class="stat-card">
        <div class="stat-label">Search status</div>
        <div class="stat-value fs-5">${$('#search').value ? 'Filtered' : 'All records'}</div>
      </div>
    </div>
  `;
}

function renderTable() {
    const fields = config.fields;
    $('#tableHead').innerHTML =
        '<tr>' +
        fields.map((f) => `<th>${esc(f.label)}</th>`).join('') +
        '<th>Actions</th></tr>';

    $('#recordsBody').innerHTML = records.length
        ? records
            .map(
                (r) =>
                    `<tr>${fields
                        .map(
                            (f) =>
                                `<td>${f.key === 'category'
                                    ? `<span class="book-pill">${esc(r[f.key])}</span>`
                                    : esc(r[f.key])
                                }</td>`
                        )
                        .join('')}<td class="text-nowrap"><button class="btn btn-sm btn-outline-primary me-1" data-edit="${esc(
                            r.id
                        )}">Edit</button><button class="btn btn-sm btn-outline-danger" data-delete="${esc(
                            r.id
                        )}">Delete</button></td></tr>`
            )
            .join('')
        : `<tr><td colspan="${fields.length + 1
        }" class="text-center text-secondary py-4">No records found. Add your first record.</td></tr>`;
}

function buildForm(record = {}) {
    editingId = record.id || null;
    const form = $('#recordForm');

    form.innerHTML =
        config.fields
            .map(
                (f) =>
                    `<div class="col-md-6"><label class="form-label" for="f_${f.key
                    }">${esc(f.label)}</label><input class="form-control" id="f_${f.key
                    }" name="${f.key}" type="${f.type === 'number' ? 'number' : 'text'
                    }" placeholder="${esc(f.placeholder || '')}" value="${esc(
                        record[f.key] ?? ''
                    )}" ${f.required ? 'required' : ''}></div>`
            )
            .join('') +
        `<div class="col-12 d-flex gap-2"><button class="btn btn-primary" type="submit">${editingId ? 'Save changes' : 'Create record'
        }</button><button class="btn btn-outline-secondary" id="cancelForm" type="button">Cancel</button></div>`;

    form.classList.remove('d-none');
    $('#cancelForm').onclick = () => form.classList.add('d-none');
}

$('#addBtn').addEventListener('click', () => buildForm());
$('#search').addEventListener('input', () => loadRecords().catch(showError));

$('#recordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
        await api(
            editingId ? `/api/records/${editingId}` : '/api/records',
            {
                method: editingId ? 'PUT' : 'POST',
                body: JSON.stringify(body),
            }
        );
        e.currentTarget.classList.add('d-none');
        $('#message').textContent = 'Record saved successfully.';
        await loadRecords();
    } catch (err) {
        showError(err);
    }
});

$('#recordsBody').addEventListener('click', async (e) => {
    const edit = e.target.dataset.edit,
        del = e.target.dataset.delete;
    try {
        if (edit) {
            const record = await api('/api/records/' + edit);
            buildForm(record);
            window.scrollTo({ top: 350, behavior: 'smooth' });
        }
        if (del && confirm('Delete this record?')) {
            await api('/api/records/' + del, { method: 'DELETE' });
            await loadRecords();
            $('#message').textContent = 'Record deleted.';
        }
    } catch (err) {
        showError(err);
    }
});

function showError(e) {
    $('#message').textContent = e.message;
}

$('#locBtn').addEventListener('click', () => {
    const out = $('#locationOutput');
    if (!navigator.geolocation) {
        out.textContent = 'Geolocation is not supported by this browser.';
        return;
    }
    out.textContent = 'Requesting location permission…';
    navigator.geolocation.getCurrentPosition(
        (p) =>
        (out.textContent = `Location: ${p.coords.latitude.toFixed(
            4
        )}, ${p.coords.longitude.toFixed(
            4
        )} (only displayed in this page)`),
        (e) => (out.textContent = `Could not get location: ${e.message}`)
    );
});

function setupTasks() {
    const key = 'lms-reading-tasks';
    let tasks = JSON.parse(localStorage.getItem(key) || '[]');
    const list = $('#taskList');

    function draw() {
        list.innerHTML =
            tasks
                .map(
                    (t, i) =>
                        `<li class="list-group-item d-flex align-items-center gap-2"><input type="checkbox" ${t.done ? 'checked' : ''
                        } data-done="${i}" aria-label="Mark task complete"><span class="flex-grow-1 ${t.done ? 'text-decoration-line-through text-secondary' : ''
                        }">${esc(t.text)}</span><button class="btn btn-sm btn-outline-danger" data-remove="${i}">Remove</button></li>`
                )
                .join('') || '<li class="list-group-item text-secondary">No tasks yet.</li>';
        localStorage.setItem(key, JSON.stringify(tasks));
    }

    $('#taskForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const text = $('#taskInput').value.trim();
        if (text) {
            tasks.push({ text, done: false });
            $('#taskInput').value = '';
            draw();
        }
    });

    list.addEventListener('click', (e) => {
        if (e.target.dataset.remove !== undefined)
            tasks.splice(Number(e.target.dataset.remove), 1);
        if (e.target.dataset.done !== undefined)
            tasks[Number(e.target.dataset.done)].done = e.target.checked;
        draw();
    });

    draw();
}

init();