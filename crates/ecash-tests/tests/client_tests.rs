use ecash_wallet::client::MintClient;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

#[tokio::test]
async fn test_client_handles_500_gracefully() {
    let mock_server = MockServer::start().await;

    // Mock the /v1/keys endpoint returning a 500
    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(500).set_body_string("Internal Server Error"))
        .mount(&mock_server)
        .await;

    let client = MintClient::new(&mock_server.uri());
    
    // Attempt to fetch keys
    let result = client.fetch_keyset().await;
    
    assert!(result.is_err());
}

#[tokio::test]
async fn test_client_handles_malformed_json_gracefully() {
    let mock_server = MockServer::start().await;

    // Mock the /v1/keys endpoint returning garbage JSON
    Mock::given(method("GET"))
        .and(path("/v1/keys"))
        .respond_with(ResponseTemplate::new(200).set_body_string("{ invalid json"))
        .mount(&mock_server)
        .await;

    let client = MintClient::new(&mock_server.uri());
    
    let result = client.fetch_keyset().await;
    assert!(result.is_err());
}
