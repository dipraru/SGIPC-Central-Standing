import axios from "axios";

const client = axios.create({
  baseURL: "https://codeforces.com/api",
  timeout: 15000,
});

export const getUserInfo = async (handle) => {
  const { data } = await client.get("/user.info", {
    params: { handles: handle },
  });

  if (data.status !== "OK" || !data.result?.length) {
    throw new Error("Codeforces user not found");
  }

  const info = data.result[0];
  return {
    handle: info.handle,
    maxRating: info.maxRating ?? info.rating ?? 0,
  };
};

export const getSolvedProblems = async (handle) => {
  const { data } = await client.get("/user.status", {
    params: { handle },
  });

  if (data.status !== "OK") {
    throw new Error("Unable to fetch submissions");
  }

  const solved = new Map();
  for (const submission of data.result) {
    if (submission.verdict !== "OK") {
      continue;
    }
    const problem = submission.problem;
    const key = `${problem.contestId}-${problem.index}`;
    if (!solved.has(key)) {
      solved.set(key, {
        name: problem.name,
        rating: problem.rating ?? null,
        contestId: problem.contestId,
        index: problem.index,
      });
    }
  }

  return Array.from(solved.values());
};
