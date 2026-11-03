import test from "node:test";
import assert from "node:assert/strict";
import { clientState, mergeClientState, validAppState } from "../api/[...path].js";

const user = { role: "client", client_id: "client-1" };
const state = {
  services: [{ id: "service-1", name: "SEO" }],
  clients: [
    { id: "client-1", uid: "client", perms: { projects: "edit", tasks: "edit" } },
    { id: "client-2", uid: "other", perms: {} }
  ],
  projects: [
    { id: "project-1", cid: "client-1", name: "My project", note: "" },
    { id: "project-2", cid: "client-2", name: "Other project", note: "" }
  ],
  tasks: [{ id: "task-1", pid: "project-1", title: "Review", who: "Admin", due: "2026-11-10", status: "Pending" }],
  costs: [{ id: "cost-1", pid: "project-1", item: "SEO", amt: 100 }],
  payments: [{ id: "payment-1", pid: "project-1", amt: 50, date: "2026-11-01" }],
  dash: {}
};

test("client response contains only its records", () => {
  const response = clientState(state, user);
  assert.deepEqual(response.clients.map(client => client.id), ["client-1"]);
  assert.deepEqual(response.projects.map(project => project.id), ["project-1"]);
  assert.equal(response.projects.some(project => project.cid === "client-2"), false);
  assert.equal(response.tasks.length, 1);
  assert.deepEqual(response.costs, []);
  assert.deepEqual(response.payments, []);
});

test("client without project permission gets only project labels needed for task context", () => {
  const restricted = structuredClone(state);
  restricted.clients[0].perms = { tasks: "view" };
  const response = clientState(restricted, user);
  assert.deepEqual(response.projects, [{ id: "project-1", cid: "client-1", name: "My project" }]);
  assert.equal(response.tasks.length, 1);
  assert.deepEqual(response.costs, []);
  assert.deepEqual(response.payments, []);
  assert.deepEqual(response.services, []);
});

test("client edits are merged only into permitted fields", () => {
  const request = structuredClone(clientState(state, user));
  request.projects[0].note = "Looks good";
  request.tasks[0].status = "Done";
  request.tasks.push({
    id: "task-2",
    pid: "project-1",
    title: "Client follow-up",
    who: "Client",
    due: "2026-11-12",
    status: "Pending"
  });
  request.dash["client-1"] = ["tasks"];

  const result = mergeClientState(state, request, user);
  assert.equal(result.projects.find(project => project.id === "project-1").note, "Looks good");
  assert.equal(result.projects.find(project => project.id === "project-2").note, "");
  assert.equal(result.tasks.find(task => task.id === "task-1").status, "Done");
  assert.equal(result.tasks.some(task => task.id === "task-2"), true);
  assert.deepEqual(result.dash["client-1"], ["tasks"]);
});

test("client cannot change payments or another client's records", () => {
  const financialState = structuredClone(state);
  financialState.clients[0].perms.payments = "view";
  financialState.clients[0].perms.costing = "view";
  const financialUser = { ...user };
  const request = structuredClone(clientState(financialState, financialUser));
  request.payments[0].amt = 0;
  assert.throws(() => mergeClientState(financialState, request, financialUser), /cannot change this data/i);

  const requestWithOtherProject = structuredClone(clientState(state, user));
  requestWithOtherProject.projects[0].cid = "client-2";
  assert.throws(() => mergeClientState(state, requestWithOtherProject, user), /cannot change/i);
});

test("application state rejects credential fields", () => {
  assert.equal(validAppState(state), true);
  assert.equal(validAppState({ ...state, admin: { password: "secret" } }), false);
  assert.equal(validAppState({
    ...state,
    clients: [{ ...state.clients[0], password_hash: "not-for-the-browser" }]
  }), false);
});
