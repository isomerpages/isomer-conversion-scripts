# Isomer Conversion Tools

Running the scripts in this folder will allow you to modify the code in an Isomer V1 repository to be compatible with Isomer V2 templates.

### How to use
1. Source your environment variables. The variables you will require are:
- Github username
- Personal access token
- Organization name
- Branch

Ideally, this should be done by the designated team account, not with your personal account.

2. Run `migrationScript.js` with the following command:

```
node migrationScript.js <repo name>
```

