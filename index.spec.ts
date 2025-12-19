import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Project } from "fixturify-project";
import { find } from "./index";

describe("find", () => {
  let project: Project;

  beforeEach(async () => {
    project = new Project("test-project");
  });

  afterEach(async () => {
    await project.dispose();
  });

  describe("parseFile", () => {
    it("parses a JSON file", async () => {
      project.files = {
        "api.json": JSON.stringify({
          paths: {
            "/users": {
              "x-custom": { message: "hello" },
            },
          },
        }),
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.json`]);

      expect(results).toEqual({
        "paths./users.x-custom": { message: "hello" },
      });
    });

    it("parses a YAML file with .yaml extension", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    x-custom:
      message: hello
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-custom": { message: "hello" },
      });
    });

    it("parses a YAML file with .yml extension", async () => {
      project.files = {
        "api.yml": `
paths:
  /users:
    x-custom:
      message: hello
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yml`]);

      expect(results).toEqual({
        "paths./users.x-custom": { message: "hello" },
      });
    });
  });

  describe("decodeJsonPointerSegment", () => {
    it("handles ~1 encoding for forward slashes in paths", async () => {
      project.files = {
        "api.yaml": `
paths:
  /activity:
    x-custom:
      message: activity endpoint
components:
  pathItems:
    Activity:
      $ref: "#/paths/~1activity"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // The property is found both at the original location and via the $ref
      expect(results).toEqual({
        "paths./activity.x-custom": { message: "activity endpoint" },
        "components.pathItems.Activity.x-custom": {
          message: "activity endpoint",
        },
      });
    });

    it("handles ~0 encoding for tildes", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    "field~name":
      x-custom:
        value: test
paths:
  /test:
    get:
      schema:
        $ref: "#/components/schemas/field~0name"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found both at original location and via $ref
      expect(results).toEqual({
        "components.schemas.field~name.x-custom": { value: "test" },
        "paths./test.get.schema.x-custom": { value: "test" },
      });
    });

    it("handles combined ~1 and ~0 encodings", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    "path/with~tilde":
      x-custom:
        value: combined
paths:
  /test:
    get:
      schema:
        $ref: "#/components/schemas/path~1with~0tilde"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found both at original location and via $ref
      expect(results).toEqual({
        "components.schemas.path/with~tilde.x-custom": { value: "combined" },
        "paths./test.get.schema.x-custom": { value: "combined" },
      });
    });
  });

  describe("resolveRef - local references", () => {
    it("resolves a simple local $ref", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "#/components/pathItems/Users"
components:
  pathItems:
    Users:
      x-custom:
        message: from ref
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found both via $ref path and at original component location
      expect(results).toEqual({
        "paths./users.x-custom": { message: "from ref" },
        "components.pathItems.Users.x-custom": { message: "from ref" },
      });
    });

    it("resolves nested local $refs", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "#/components/pathItems/Users"
components:
  pathItems:
    Users:
      get:
        $ref: "#/components/operations/GetUsers"
  operations:
    GetUsers:
      x-custom:
        message: nested ref
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found at both the path via refs and at the original component location
      expect(results).toEqual({
        "paths./users.get.x-custom": { message: "nested ref" },
        "components.operations.GetUsers.x-custom": { message: "nested ref" },
      });
    });

    it("handles invalid local $ref gracefully", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "#/components/pathItems/NonExistent"
    x-custom:
      message: should not appear
components:
  pathItems: {}
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({});
    });

    it("preserves parameter names for component parameter refs in arrays", async () => {
      project.files = {
        "api.yaml": `
paths:
  /search:
    post:
      parameters:
        - $ref: "#/components/parameters/foo"
components:
  parameters:
    foo:
      name: foo
      x-custom:
        message: hello
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./search.post.parameters.0.foo.x-custom": { message: "hello" },
        "components.parameters.foo.x-custom": { message: "hello" },
      });
    });

    it("prevents circular reference loops", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    A:
      $ref: "#/components/schemas/B"
    B:
      $ref: "#/components/schemas/A"
paths:
  /test:
    schema:
      $ref: "#/components/schemas/A"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({});
    });
  });

  describe("resolveExternalRef - external file references", () => {
    it("resolves a simple external file $ref", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./paths/users.yaml"
`,
        paths: {
          "users.yaml": `
x-custom:
  message: from external file
get:
  summary: Get users
`,
        },
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // External file content is dereferenced at the path location
      expect(results).toEqual({
        "paths./users.x-custom": { message: "from external file" },
      });
    });

    it("resolves external $ref with JSON pointer", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./components.yaml#/pathItems/Users"
`,
        "components.yaml": `
pathItems:
  Users:
    x-custom:
      message: external with pointer
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-custom": { message: "external with pointer" },
      });
    });

    it("caches external files to avoid re-parsing", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./shared.yaml#/endpoints/Users"
  /posts:
    $ref: "./shared.yaml#/endpoints/Posts"
`,
        "shared.yaml": `
endpoints:
  Users:
    x-custom:
      message: users
  Posts:
    x-custom:
      message: posts
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-custom": { message: "users" },
        "paths./posts.x-custom": { message: "posts" },
      });
    });

    it("resolves nested external $refs across multiple files", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./paths/users.yaml"
`,
        paths: {
          "users.yaml": `
get:
  $ref: "../operations/get-users.yaml"
post:
  summary: Create user
`,
        },
        operations: {
          "get-users.yaml": `
x-custom:
  message: deeply nested
summary: Get all users
`,
        },
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // External file content is dereferenced following the ref chain
      expect(results).toEqual({
        "paths./users.get.x-custom": { message: "deeply nested" },
      });
    });

    it("handles mixed local and external refs", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./paths.yaml#/Users"
  /posts:
    $ref: "#/components/pathItems/Posts"
components:
  pathItems:
    Posts:
      x-custom:
        message: local ref
`,
        "paths.yaml": `
Users:
  x-custom:
    message: external ref
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found via refs and at original component locations
      expect(results).toEqual({
        "paths./users.x-custom": { message: "external ref" },
        "paths./posts.x-custom": { message: "local ref" },
        "components.pathItems.Posts.x-custom": { message: "local ref" },
      });
    });

    it("prevents circular references across external files", async () => {
      project.files = {
        "api.yaml": `
paths:
  /test:
    $ref: "./a.yaml"
`,
        "a.yaml": `
get:
  $ref: "./b.yaml"
`,
        "b.yaml": `
response:
  $ref: "./a.yaml"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({});
    });
  });

  describe("buildPath", () => {
    it("builds simple dot-notation paths", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    User:
      properties:
        name:
          x-custom:
            value: test
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "components.schemas.User.properties.name.x-custom": { value: "test" },
      });
    });

    it("handles paths with special characters", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users/{userId}:
    x-custom:
      value: with params
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users/{userId}.x-custom": { value: "with params" },
      });
    });

    it("handles array indices in paths", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    get:
      parameters:
        - name: limit
          x-custom:
            value: first param
        - name: offset
          x-custom:
            value: second param
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.get.parameters.0.x-custom": { value: "first param" },
        "paths./users.get.parameters.1.x-custom": { value: "second param" },
      });
    });
  });

  describe("walkObject", () => {
    it("walks through nested objects", async () => {
      project.files = {
        "api.yaml": `
level1:
  level2:
    level3:
      x-custom:
        value: deep
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "level1.level2.level3.x-custom": { value: "deep" },
      });
    });

    it("walks through arrays", async () => {
      project.files = {
        "api.yaml": `
items:
  - x-custom:
      value: first
  - x-custom:
      value: second
  - nested:
      x-custom:
        value: third
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "items.0.x-custom": { value: "first" },
        "items.1.x-custom": { value: "second" },
        "items.2.nested.x-custom": { value: "third" },
      });
    });

    it("handles null values gracefully", async () => {
      project.files = {
        "api.yaml": `
paths:
  /test:
    description: null
    x-custom:
      value: test
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./test.x-custom": { value: "test" },
      });
    });

    it("handles primitive values in objects", async () => {
      project.files = {
        "api.yaml": `
paths:
  /test:
    summary: "A test endpoint"
    deprecated: true
    x-custom:
      value: test
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./test.x-custom": { value: "test" },
      });
    });

    it("does not recurse into the found property value", async () => {
      project.files = {
        "api.yaml": `
paths:
  /test:
    x-custom:
      nested:
        x-custom:
          value: should not be found separately
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./test.x-custom": {
          nested: {
            "x-custom": {
              value: "should not be found separately",
            },
          },
        },
      });
    });
  });

  describe("find - main function", () => {
    it("returns empty object for empty files", async () => {
      project.files = {
        "api.yaml": `{}`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({});
    });

    it("returns empty object when property not found", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    get:
      summary: Get users
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({});
    });

    it("searches multiple files", async () => {
      project.files = {
        "api1.yaml": `
paths:
  /users:
    x-custom:
      file: first
`,
        "api2.yaml": `
paths:
  /posts:
    x-custom:
      file: second
`,
      };
      await project.write();

      const results = await find("x-custom", [
        `${project.baseDir}/api1.yaml`,
        `${project.baseDir}/api2.yaml`,
      ]);

      expect(results).toEqual({
        "paths./users.x-custom": { file: "first" },
        "paths./posts.x-custom": { file: "second" },
      });
    });

    it("finds multiple occurrences of the same property", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    x-deprecated:
      reason: Use /people
    get:
      x-deprecated:
        reason: Use /people with GET
  /posts:
    x-deprecated:
      reason: Use /articles
`,
      };
      await project.write();

      const results = await find("x-deprecated", [
        `${project.baseDir}/api.yaml`,
      ]);

      expect(results).toEqual({
        "paths./users.x-deprecated": { reason: "Use /people" },
        "paths./users.get.x-deprecated": { reason: "Use /people with GET" },
        "paths./posts.x-deprecated": { reason: "Use /articles" },
      });
    });

    it("handles property values that are primitives", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    x-custom: simple string value
    get:
      x-custom: 42
    post:
      x-custom: true
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-custom": "simple string value",
        "paths./users.get.x-custom": 42,
        "paths./users.post.x-custom": true,
      });
    });

    it("handles property values that are arrays", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    x-tags:
      - users
      - api
      - v1
`,
      };
      await project.write();

      const results = await find("x-tags", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-tags": ["users", "api", "v1"],
      });
    });

    it("handles property values that are arrays of objects", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    UserRequest:
      properties:
        userType:
          type: string
          enum: [foo, bar, baz]
          x-glean-deprecated:
            - id: "abc"
              value: foo
            - id: "123"
              value: bar
`,
      };
      await project.write();

      const results = await find("x-glean-deprecated", [
        `${project.baseDir}/api.yaml`,
      ]);

      expect(results).toEqual({
        "components.schemas.UserRequest.properties.userType.x-glean-deprecated":
          [
            {
              id: "abc",
              value: "foo",
            },
            {
              id: "123",
              value: "bar",
            },
          ],
      });
    });

    it("works with realistic OpenAPI structure", async () => {
      project.files = {
        "openapi.yaml": `
openapi: 3.0.0
info:
  title: Test API
  version: 1.0.0
paths:
  /users:
    x-controller: UsersController
    get:
      x-operation-id: listUsers
      summary: List all users
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserList"
    post:
      x-operation-id: createUser
      summary: Create a user
components:
  schemas:
    UserList:
      type: array
      items:
        $ref: "#/components/schemas/User"
    User:
      type: object
      x-entity: true
      properties:
        id:
          type: string
        name:
          type: string
`,
      };
      await project.write();

      const results = await find("x-operation-id", [
        `${project.baseDir}/openapi.yaml`,
      ]);

      expect(results).toEqual({
        "paths./users.get.x-operation-id": "listUsers",
        "paths./users.post.x-operation-id": "createUser",
      });

      const entityResults = await find("x-entity", [
        `${project.baseDir}/openapi.yaml`,
      ]);

      // x-entity is found at the original location and via the $ref chain
      // Note: components.schemas.UserList.items.x-entity is not included because
      // the circular reference detection marks #/components/schemas/User as visited
      // before traversing UserList.items (since User is traversed first alphabetically)
      expect(entityResults).toEqual({
        "components.schemas.User.x-entity": true,
        "paths./users.get.responses.200.content.application/json.schema.items.x-entity": true,
      });
    });

    it("supports generic type parameter", async () => {
      interface CustomExtension {
        message: string;
        code: number;
      }

      project.files = {
        "api.yaml": `
paths:
  /users:
    x-custom:
      message: hello
      code: 200
`,
      };
      await project.write();

      const results = await find<CustomExtension>("x-custom", [
        `${project.baseDir}/api.yaml`,
      ]);

      expect(results["paths./users.x-custom"].message).toBe("hello");
      expect(results["paths./users.x-custom"].code).toBe(200);
    });
  });

  describe("edge cases", () => {
    it("handles deeply nested structures", async () => {
      project.files = {
        "api.yaml": `
a:
  b:
    c:
      d:
        e:
          f:
            g:
              x-custom:
                value: very deep
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "a.b.c.d.e.f.g.x-custom": { value: "very deep" },
      });
    });

    it("handles empty arrays", async () => {
      project.files = {
        "api.yaml": `
paths:
  /test:
    parameters: []
    x-custom:
      value: test
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./test.x-custom": { value: "test" },
      });
    });

    it("handles keys that look like numbers", async () => {
      project.files = {
        "api.yaml": `
responses:
  "200":
    x-custom:
      status: ok
  "404":
    x-custom:
      status: not found
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "responses.200.x-custom": { status: "ok" },
        "responses.404.x-custom": { status: "not found" },
      });
    });

    it("handles JSON files with external refs", async () => {
      project.files = {
        "api.json": JSON.stringify({
          paths: {
            "/users": {
              $ref: "./users.json",
            },
          },
        }),
        "users.json": JSON.stringify({
          "x-custom": {
            value: "from json ref",
          },
        }),
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.json`]);

      expect(results).toEqual({
        "paths./users.x-custom": { value: "from json ref" },
      });
    });

    it("handles mixed JSON and YAML references", async () => {
      project.files = {
        "api.yaml": `
paths:
  /users:
    $ref: "./users.json"
`,
        "users.json": JSON.stringify({
          "x-custom": {
            value: "json from yaml",
          },
        }),
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      expect(results).toEqual({
        "paths./users.x-custom": { value: "json from yaml" },
      });
    });

    it("handles self-referencing $ref", async () => {
      project.files = {
        "api.yaml": `
components:
  schemas:
    Node:
      type: object
      x-custom:
        value: node
      properties:
        children:
          type: array
          items:
            $ref: "#/components/schemas/Node"
`,
      };
      await project.write();

      const results = await find("x-custom", [`${project.baseDir}/api.yaml`]);

      // Found at the original location and via the $ref (before circular detection kicks in)
      expect(results).toEqual({
        "components.schemas.Node.x-custom": { value: "node" },
        "components.schemas.Node.properties.children.items.x-custom": {
          value: "node",
        },
      });
    });
  });
});
