export class SecretsAdapter {
  constructor(smart_secrets) {
    this.smart_secrets = smart_secrets;
    this.data = {};
  }

  get is_persistent() {
    return false;
  }

  get_by_id(secret_id) {
    return Object.prototype.hasOwnProperty.call(this.data, secret_id)
      ? this.data[secret_id]
      : null
    ;
  }

  set_by_id(secret_id, value) {
    this.data[secret_id] = String(value ?? '');
    return true;
  }

  delete_by_id(secret_id) {
    delete this.data[secret_id];
    return true;
  }
}
