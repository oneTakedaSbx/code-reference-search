const fs = require("fs");
const axios = require("axios");
const searchData = require("./search.json");

// personal access token stored in env
const githubReadApiKey = process.env.TOKEN;

const findings: any = {
  repos: {},
  code: {},
};

// const rateLimit: any = {
//   remaining: 0,
// };

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRateLimit() {
  return axios.get("https://api.github.com/rate_limit", {
    headers: {
      Authorization: `token ${githubReadApiKey}`,
    },
  });
}

interface Owner {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}

interface Repository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: Owner;
  html_url: string;
  description: string;
  fork: boolean;
  url: string;
  forks_url: string;
  keys_url: string;
  collaborators_url: string;
  teams_url: string;
  hooks_url: string;
  issue_events_url: string;
  events_url: string;
  assignees_url: string;
  branches_url: string;
  tags_url: string;
  blobs_url: string;
  git_tags_url: string;
  git_refs_url: string;
  trees_url: string;
  statuses_url: string;
  languages_url: string;
  stargazers_url: string;
  contributors_url: string;
  subscribers_url: string;
  subscription_url: string;
  commits_url: string;
  git_commits_url: string;
  comments_url: string;
  issue_comment_url: string;
  contents_url: string;
  compare_url: string;
  merges_url: string;
  archive_url: string;
  downloads_url: string;
  issues_url: string;
  pulls_url: string;
  milestones_url: string;
  notifications_url: string;
  labels_url: string;
  releases_url: string;
  deployments_url: string;
}

interface Item {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: Repository;
  score: number;
}

interface SearchResults {
  total_count: number;
  incomplete_results: boolean;
  items: Item[];
}

async function searchCode(codeStr: string, org?: string): Promise<SearchResults | null> {
  const orgStr = org ? `+org:${org}` : "";
  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await axios
        .get(
          `https://api.github.com/search/code?q=${encodeURIComponent(
            codeStr
          )}${orgStr} language:YAML &per_page=100`,
          {
            validateStatus: function () {
              return true;
            },
            headers: {
              Authorization: `token ${githubReadApiKey}`,
            },
          }
        )
        .catch((e: Error) => {
          console.error(e);
        });
      if (res.status > 200) {
        console.log(res.data.message);
        const retryAfter = parseInt(res.headers["retry-after"]);
        console.log(
          `Sleeping for ${retryAfter + 1} seconds before trying again...`
        );
        await sleep((retryAfter + 1) * 1000);
      } else {
        return res.data;
      }
    } catch (e) {
      console.error(e);
    }
  }
  // shouldn't get here...
  return Promise.resolve(null);
}

async function processResults(results: any, codeStr: string, org?: string) {
  console.log(`${codeStr}: ${results.items.length} - ${results.total_count}`);
  const items = results.items;
  findings.code[codeStr].count =
    findings.code[codeStr].count + results.total_count;
  items.forEach((item: any) => {
    if (
      findings.code[codeStr].repos.indexOf(item.repository.full_name) === -1
    ) {
      findings.code[codeStr].repos.push(item.repository.full_name);
      findings.code[codeStr].repoCount = findings.code[codeStr].repos.length;
    }
    if (Object.keys(findings.repos).indexOf(item.repository.full_name) === -1) {
      findings.repos[item.repository.full_name] = {
        paths: [
          {
            path: item.path,
            score: item.score,
            url: item.html_url,
          },
        ],
        code: {},
        codeCount: 1,
      };
      findings.repos[item.repository.full_name].code[codeStr] = 1;
    } else {
      findings.repos[item.repository.full_name].paths.push({
        path: item.path,
        score: item.score,
        url: item.html_url,
      });
      if (
        Object.keys(findings.repos[item.repository.full_name].code).indexOf(
          codeStr
        ) === -1
      ) {
        findings.repos[item.repository.full_name].code[codeStr] = 1;
        findings.repos[item.repository.full_name].codeCount = Object.keys(
          findings.repos[item.repository.full_name].code
        ).length;
      } else {
        findings.repos[item.repository.full_name].code[codeStr] =
          findings.repos[item.repository.full_name].code[codeStr] + 1;
      }
    }
    findings.repos[item.repository.full_name].pathCount =
      findings.repos[item.repository.full_name].paths.length;
  });
}

async function main() {
  console.log("Starting Search...");
  const flattenedSearches: string[][] = [];
  searchData.codeStrings.forEach((codeStr: string) => {
    searchData.organizations.forEach((org: string) =>
      flattenedSearches.push([codeStr, org])
    );
  });
  for (let searchInd = 0; searchInd < flattenedSearches.length; searchInd++) {
    const search = flattenedSearches[searchInd];
    const searchResults = await searchCode(search[0], search[1]);
    findings.code[search[0]] = {
      count: 0,
      repos: [],
      repoCount: 0,
    };
    processResults(searchResults, search[0], search[1]);
  }
  findings.priority = {
    repos: Object.keys(findings.repos).sort(
      (a, b) => findings.repos[b].pathCount - findings.repos[a].pathCount
    ),
    code: Object.keys(findings.code).sort(
      (a, b) => findings.code[b].count - findings.code[a].count
    ),
  };

  let data = JSON.stringify(findings, null, 2);
  console.log(`search results: ${data}`);
  fs.writeFileSync("output.json", data);
  console.log("Search Complete!");
}

main().catch((e) => console.error(e));
