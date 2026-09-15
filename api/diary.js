import {
  getAdminClient,
  getSessionFromRequest,
  readBody,
  sendJson
} from "./_lib/auth.js";

function planPayload(value = {}) {
  return {
    title: String(value.title || "").trim(),
    start_date: value.start_date || null,
    start_time: value.start_time || null,
    end_date: value.end_date || null,
    end_time: value.end_time || null,
    success_criteria: String(value.success_criteria || "").trim(),
    estimated_minutes: Number(value.estimated_minutes || 0),
    priority: ["high", "medium", "low"].includes(value.priority) ? value.priority : "medium"
  };
}

function todoPayload(value = {}) {
  return {
    plan_id: value.plan_id,
    title: String(value.title || "").trim(),
    deadline: value.deadline || null,
    priority: ["high", "medium", "low"].includes(value.priority) ? value.priority : "medium",
    tag: String(value.tag || "").trim(),
    estimated_minutes: Number(value.estimated_minutes || 0),
    scheduled_start: value.scheduled_start || null
  };
}

async function ownedPlan(supabase, userId, planId) {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ownedTodo(supabase, userId, todoId) {
  const { data, error } = await supabase
    .from("todos")
    .select("*")
    .eq("id", todoId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function requireSession(req, res) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    sendJson(res, 401, { ok: false, message: "로그인이 필요합니다." });
    return null;
  }
  return session;
}

async function handleGet(req, res, session) {
  const supabase = getAdminClient();
  const userId = session.user.id;
  const url = new URL(req.url, "https://local.invalid");
  const action = url.searchParams.get("action") || "all";

  if (action === "all") {
    const [plans, todos, logs, history, reviews] = await Promise.all([
      supabase.from("plans").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("todos").select("*").eq("user_id", userId),
      supabase.from("work_logs").select("*").eq("user_id", userId),
      supabase.from("plan_history").select("*").eq("user_id", userId),
      supabase.from("reviews").select("*").eq("user_id", userId)
    ]);

    const error = plans.error || todos.error || logs.error || history.error || reviews.error;
    if (error) throw error;

    return sendJson(res, 200, {
      ok: true,
      plans: plans.data || [],
      todos: todos.data || [],
      logs: logs.data || [],
      history: history.data || [],
      reviews: reviews.data || []
    });
  }

  if (action === "latest-plan") {
    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    return sendJson(res, 200, {
      ok: true,
      plan: data?.[0] || null
    });
  }

  if (action === "plan") {
    const id = url.searchParams.get("id");
    if (!id) {
      return sendJson(res, 400, { ok: false, message: "계획 ID가 필요합니다." });
    }

    const plan = await ownedPlan(supabase, userId, id);
    if (!plan) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    return sendJson(res, 200, { ok: true, plan });
  }

  return sendJson(res, 400, { ok: false, message: "잘못된 요청입니다." });
}

function planScheduleISO(payload = {}) {
  if (!payload.start_date || !payload.start_time) return null;

  const time = String(payload.start_time).length === 5
    ? `${payload.start_time}:00`
    : payload.start_time;

  const d = new Date(`${payload.start_date}T${time}+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function syncPlanTask(supabase, userId, plan) {
  const values = {
    user_id: userId,
    plan_id: plan.id,
    title: plan.title,
    deadline: plan.end_date || null,
    priority: plan.priority || "medium",
    tag: "",
    estimated_minutes: Number(plan.estimated_minutes || 0),
    scheduled_start: planScheduleISO(plan),
    is_plan_task: true
  };

  const { data: existing, error: findError } = await supabase
    .from("todos")
    .select("id, status")
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .eq("is_plan_task", true)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("todos")
      .update(values)
      .eq("id", existing.id)
      .eq("user_id", userId);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("todos")
    .insert({
      ...values,
      status: "todo"
    });

  if (error) throw error;
}

async function handlePost(req, res, session) {
  const supabase = getAdminClient();
  const userId = session.user.id;
  const body = readBody(req);
  const action = body.action;

  if (action === "save-plan") {
    const payload = planPayload(body.payload);

    if (!payload.title) {
      return sendJson(res, 400, { ok: false, message: "계획 제목을 입력해 주세요." });
    }

    if (body.id) {
      const old = await ownedPlan(supabase, userId, body.id);
      if (!old) {
        return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
      }

      const history = {
        user_id: userId,
        plan_id: old.id,
        title: old.title,
        start_date: old.start_date,
        start_time: old.start_time,
        end_date: old.end_date,
        end_time: old.end_time,
        success_criteria: old.success_criteria,
        estimated_minutes: old.estimated_minutes,
        priority: old.priority,
        snapshot_at: new Date().toISOString()
      };

      const { error: historyError } = await supabase
        .from("plan_history")
        .insert(history);

      if (historyError) throw historyError;

      const { data, error } = await supabase
        .from("plans")
        .update(payload)
        .eq("id", body.id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
      }

      await syncPlanTask(supabase, userId, data);

      return sendJson(res, 200, { ok: true, plan: data });
    }

    const { data, error } = await supabase
      .from("plans")
      .insert({ ...payload, user_id: userId })
      .select("*")
      .single();

    if (error) throw error;

    await syncPlanTask(supabase, userId, data);

    return sendJson(res, 201, { ok: true, plan: data });
  }

  if (action === "delete-plan") {
    const plan = await ownedPlan(supabase, userId, body.id);
    if (!plan) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    const { data: relatedTodos, error: todoFindError } = await supabase
      .from("todos")
      .select("id")
      .eq("plan_id", body.id)
      .eq("user_id", userId);

    if (todoFindError) throw todoFindError;

    const todoIds = (relatedTodos || []).map(t => t.id);

    if (todoIds.length) {
      const { error: logError } = await supabase
        .from("work_logs")
        .delete()
        .in("todo_id", todoIds)
        .eq("user_id", userId);

      if (logError) throw logError;
    }

    const { error: reviewError } = await supabase
      .from("reviews")
      .delete()
      .eq("plan_id", body.id)
      .eq("user_id", userId);

    if (reviewError) throw reviewError;

    const { error: historyError } = await supabase
      .from("plan_history")
      .delete()
      .eq("plan_id", body.id)
      .eq("user_id", userId);

    if (historyError) throw historyError;

    const { error: todoError } = await supabase
      .from("todos")
      .delete()
      .eq("plan_id", body.id)
      .eq("user_id", userId);

    if (todoError) throw todoError;

    const { error: planError } = await supabase
      .from("plans")
      .delete()
      .eq("id", body.id)
      .eq("user_id", userId);

    if (planError) throw planError;

    return sendJson(res, 200, { ok: true });
  }

  if (action === "save-todo") {
    const payload = todoPayload(body.payload);

    if (!payload.title) {
      return sendJson(res, 400, { ok: false, message: "할 일 제목을 입력해 주세요." });
    }

    const plan = await ownedPlan(supabase, userId, payload.plan_id);
    if (!plan) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    if (body.id) {
      const todo = await ownedTodo(supabase, userId, body.id);
      if (!todo) {
        return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
      }

      const { data, error } = await supabase
        .from("todos")
        .update(payload)
        .eq("id", body.id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
      }

      return sendJson(res, 200, { ok: true, todo: data });
    }

    const { data, error } = await supabase
      .from("todos")
      .insert({
        ...payload,
        user_id: userId,
        status: "todo"
      })
      .select("*")
      .single();

    if (error) throw error;
    return sendJson(res, 201, { ok: true, todo: data });
  }

  if (action === "toggle-todo") {
    const todo = await ownedTodo(supabase, userId, body.id);
    if (!todo) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    if (body.status !== "done") {
      const { data: running, error: runningError } = await supabase
        .from("work_logs")
        .select("id")
        .eq("todo_id", body.id)
        .eq("user_id", userId)
        .eq("is_running", true)
        .maybeSingle();

      if (runningError) throw runningError;

      if (running) {
        return sendJson(res, 409, {
          ok: false,
          message: "진행 중인 할 일은 완료 버튼으로 종료해 주세요."
        });
      }
    }

    const next = body.status === "done" ? "todo" : "done";

    const { data, error } = await supabase
      .from("todos")
      .update({
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null
      })
      .eq("id", body.id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    return sendJson(res, 200, { ok: true, todo: data });
  }

  if (action === "delete-todo") {
    const todo = await ownedTodo(supabase, userId, body.id);
    if (!todo) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    // 연결된 실행 기록도 현재 사용자 소유인 경우에만 삭제
    const { error: logError } = await supabase
      .from("work_logs")
      .delete()
      .eq("todo_id", body.id)
      .eq("user_id", userId);

    if (logError) throw logError;

    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", body.id)
      .eq("user_id", userId);

    if (error) throw error;
    return sendJson(res, 200, { ok: true });
  }

  if (action === "start-todo") {
    const todo = await ownedTodo(supabase, userId, body.id);

    if (!todo) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    if (todo.status === "done") {
      return sendJson(res, 400, { ok: false, message: "이미 완료된 할 일입니다." });
    }

    const { data: running, error: runningError } = await supabase
      .from("work_logs")
      .select("id")
      .eq("todo_id", body.id)
      .eq("user_id", userId)
      .eq("is_running", true)
      .maybeSingle();

    if (runningError) throw runningError;

    if (running) {
      return sendJson(res, 409, { ok: false, message: "이미 실행 중입니다." });
    }

    const startedAt = new Date().toISOString();

    const { data: log, error } = await supabase
      .from("work_logs")
      .insert({
        user_id: userId,
        todo_id: todo.id,
        started_at: startedAt,
        ended_at: null,
        actual_minutes: 0,
        blocker: "",
        is_running: true
      })
      .select("*")
      .single();

    if (error) throw error;

    return sendJson(res, 201, { ok: true, log });
  }

  if (action === "complete-todo") {
    const todo = await ownedTodo(supabase, userId, body.id);

    if (!todo) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    const { data: running, error: runningError } = await supabase
      .from("work_logs")
      .select("*")
      .eq("todo_id", body.id)
      .eq("user_id", userId)
      .eq("is_running", true)
      .maybeSingle();

    if (runningError) throw runningError;

    if (!running) {
      return sendJson(res, 400, { ok: false, message: "진행 중인 실행 기록이 없습니다." });
    }

    const endedAt = new Date();
    const startedAt = new Date(running.started_at);
    const elapsedMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    const actualMinutes = elapsedMs > 0 ? Math.max(1, Math.round(elapsedMs / 60000)) : 0;

    const { data: log, error: logError } = await supabase
      .from("work_logs")
      .update({
        ended_at: endedAt.toISOString(),
        actual_minutes: actualMinutes,
        is_running: false
      })
      .eq("id", running.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (logError) throw logError;

    const { data: updatedTodo, error: todoError } = await supabase
      .from("todos")
      .update({
        status: "done",
        completed_at: endedAt.toISOString()
      })
      .eq("id", todo.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (todoError) throw todoError;

    return sendJson(res, 200, {
      ok: true,
      todo: updatedTodo,
      log
    });
  }

  if (action === "save-log") {
    const payload = body.payload || {};
    const todo = await ownedTodo(supabase, userId, payload.todo_id);

    if (!todo) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    const row = {
      user_id: userId,
      todo_id: payload.todo_id,
      started_at: payload.started_at || null,
      ended_at: payload.ended_at || null,
      actual_minutes: Number(payload.actual_minutes || 0),
      blocker: String(payload.blocker || "").trim(),
      is_running: false
    };

    const { data, error } = await supabase
      .from("work_logs")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return sendJson(res, 201, { ok: true, log: data });
  }

  if (action === "save-review") {
    const planId = body.plan_id;
    const plan = await ownedPlan(supabase, userId, planId);

    if (!plan) {
      return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
    }

    const content = String(body.content || "").trim();

    if (body.id) {
      const { data: ownedReview, error: findError } = await supabase
        .from("reviews")
        .select("id")
        .eq("id", body.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (findError) throw findError;
      if (!ownedReview) {
        return sendJson(res, 404, { ok: false, message: "자료를 찾을 수 없습니다." });
      }

      const { data, error } = await supabase
        .from("reviews")
        .update({ content })
        .eq("id", body.id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return sendJson(res, 200, { ok: true, review: data });
    }

    const { data: existing, error: existingError } = await supabase
      .from("reviews")
      .select("*")
      .eq("plan_id", planId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await supabase
        .from("reviews")
        .update({ content })
        .eq("id", existing.id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      return sendJson(res, 200, { ok: true, review: data });
    }

    const { data, error } = await supabase
      .from("reviews")
      .insert({
        user_id: userId,
        plan_id: planId,
        content
      })
      .select("*")
      .single();

    if (error) throw error;
    return sendJson(res, 201, { ok: true, review: data });
  }

  return sendJson(res, 400, { ok: false, message: "잘못된 요청입니다." });
}

export default async function handler(req, res) {
  try {
    const session = await requireSession(req, res);
    if (!session) return;

    if (req.method === "GET") {
      return await handleGet(req, res, session);
    }

    if (req.method === "POST") {
      return await handlePost(req, res, session);
    }

    return sendJson(
      res,
      405,
      { ok: false, message: "허용되지 않은 요청입니다." },
      { Allow: "GET, POST" }
    );
  } catch (error) {
    console.error("diary api error:", error?.message || error);
    return sendJson(res, 500, {
      ok: false,
      message: "데이터 처리 중 오류가 발생했습니다."
    });
  }
}
